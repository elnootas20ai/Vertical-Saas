# SALA / MESAS — Plan de Tickets

**Página:** `/saas/sala`  
**Objetivo:** Gestionar el servicio en local cuando el negocio tenga mesas físicas (módulo opcional).  
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Plano de mesas visual (canvas 2D con zoom, grid, drag & drop) | Completo | `TpvTab.tsx` — vista `locales`, ruta `/saas/tpv/locales` |
| Modelo de mesa local (`TpvTable`: id, number, gridW, gridH, x, y, zone, zoneResponsible, status) | Completo | `TpvTab.tsx` líneas 24-34 — solo localStorage |
| Estados de mesa (`available`, `occupied`, `pending`, `served`, `unavailable`, `hidden`) | Completo | `TpvTab.tsx` — constantes `STATUS_COLORS`, `STATUS_LABELS`, `STATUS_DOTS` |
| Creación / eliminación de mesas desde el plano | Completo | `TpvTab.tsx` — `handleCreateTable`, `handleDeleteTable` |
| Cambio manual de estado de mesa | Completo | `TpvTab.tsx` — `handleChangeTableStatus` |
| Muros / paredes decorativas (dibujar, eliminar) | Completo | `TpvTab.tsx` — `TpvWall`, `wallMode`, canvas |
| Barras / secciones de recepción (CRUD local) | Completo | `TpvTab.tsx` — `BarManager`, `DEFAULT_BARS` |
| Modelo de pedido local (`TpvOrder`: items, total, status, createdBy, paymentMethod…) | Completo | `TpvTab.tsx` líneas 68-85 — solo localStorage |
| Añadir/eliminar/actualizar ítems de un pedido (comanda) | Completo | `TpvTab.tsx` — `handleAddItem`, `handleRemoveItem`, `handleUpdateItemQty` |
| Cobro de mesa (efectivo/tarjeta, cálculo de cambio, impresión ticket) | Completo | `TpvTab.tsx` — `handleBill`, `BillModal`, `printReceipt` |
| Historial de pedidos cobrados (tabla con KPIs) | Completo | `TpvTab.tsx` — `showHistory`, `historyOrders` |
| Impresión del plano de mesas | Completo | `TpvTab.tsx` — `printFloorPlan` |
| Selección de operador (miembro del equipo) antes de operar | Completo | `TpvTab.tsx` — pantalla de selección de operador con búsqueda e invitación |
| Catálogo de productos (carga remota desde delivery) | Completo | `TpvTab.tsx` — `listCatalogItemsRequest` → `deliveryApi.ts` |
| Ocultar/mostrar productos en el TPV | Completo | `TpvTab.tsx` — `hiddenProductIds` |
| Crear producto rápido desde TPV | Completo | `TpvTab.tsx` — `CreateProductModal`, `createCatalogItemRequest` |
| Configuración de barras y productos | Completo | `TpvTab.tsx` — vista `showSettings` |
| Flujo de estados de pedido delivery (`pending` → `preparing` → `kitchen` → `assembly` → `delivery` → `delivered`) | Completo | `deliveryApi.ts` — `DeliveryOrderStatus` |
| Vista cocina en delivery (pestaña) | Parcial | `Delivery.tsx` — pestaña "Vista de cocina", KPIs, transiciones |
| SSE (Server-Sent Events) para tiempo real | Completo (infra) | `useSSE.ts` — hook con reconexión automática; usado en chat, no en sala/cocina |
| Sistema de permisos por módulo | Completo (infra) | `roleCatalog.ts` — `ROLE_PERMISSION_OPTIONS`, `AccountPermissionMatrix` |
| Sistema de roles (Admin, Gerente, Comercial, etc.) | Completo (infra) | `roleCatalog.ts`, `Team.tsx`, `TeamMemberDetail.tsx` |
| CRM con clientes | Completo | `crmRouter.js`, `crmController.js`, `ClientsPage.tsx` |
| Motor de alertas backend | Completo (infra) | `alertEngine.js` — ejecuta checks cada hora |
| API de delivery (pedidos, catálogo, drivers, TPV sessions, points of sale) | Completo | `deliveryRouter.js`, `deliveryController.js`, `deliveryApi.ts` |

### Lo que FALTA

| Funcionalidad | Estado |
|---|---|
| **Persistencia servidor** — mesas, pedidos y configuración de sala se guardan SOLO en localStorage del navegador; se pierden al limpiar caché o cambiar de dispositivo | No implementado |
| **Módulo opcional** — no hay toggle para activar/desactivar el módulo de sala por negocio; la ruta `/saas/tpv/locales` siempre existe | No implementado |
| **Ruta propia de sala** — no existe `/saas/sala`; la funcionalidad está embebida dentro del TPV como vista "Locales" | No implementado |
| **Concepto de "comanda"** — no existe como entidad separada; los ítems se añaden directamente al pedido sin envío explícito a cocina | No implementado |
| **Envío a cocina** — no hay flujo de enviar una comanda/pedido de sala a la vista de cocina; los pedidos de sala y delivery son sistemas desconectados | No implementado |
| **Sincronización con cocina** — los pedidos de sala no participan del flujo `kitchen` → `assembly` → `served` que usa delivery | No implementado |
| **Actualización automática de estado de mesa** — el estado se cambia solo manualmente; no hay transiciones automáticas (ej: al servir todo → mesa "servida") | No implementado |
| **Separación de cuentas** — no se puede dividir una mesa en varias cuentas ni cobrar parcialmente | No implementado |
| **Unión de cuentas / mesas** — no se pueden fusionar pedidos de varias mesas en una sola cuenta | No implementado |
| **Cierre formal de mesa** — cobrar = mesa queda disponible automáticamente, pero no hay proceso de cierre con verificación | No implementado |
| **Recogida local (takeaway)** — los pedidos de recogida en local no aparecen en la vista de sala | No implementado |
| **Tiempo real entre dispositivos** — no hay SSE/WebSocket para que varios camareros vean cambios en las mesas simultáneamente | No implementado |
| **Permiso específico de sala** — no existe `sala` como clave en `ROLE_PERMISSION_OPTIONS`; solo existe `tpv` | No implementado |
| **Alertas de sala** — no hay alertas en `alertEngine.js` para mesa sin cobro, pedido servido pendiente de cierre, ni incidencias de sala | No implementado |
| **Conexión sala → caja** — el cobro de mesa no genera un movimiento financiero ni se registra en la caja del sistema | No implementado |
| **Conexión sala → CRM** — no se vincula un cliente de CRM a una mesa ni se acumula historial de consumo | No implementado |
| **Notas / observaciones por ítem** — no se pueden añadir notas a ítems del pedido (ej: "sin gluten", "poco hecho") | No implementado |
| **Número de comensales por mesa** — no se registra cuántas personas están sentadas | No implementado |
| **Tiempo de ocupación** — no se mide cuánto tiempo lleva una mesa ocupada | No implementado |

---

## Tickets

---

### SALA-01 — Modelo de datos: Mesa persistente en servidor

**Tipo:** Backend + API Client  
**Prioridad:** Crítica  
**Dependencias:** Ninguna

#### Contexto
Actualmente las mesas se almacenan en `localStorage` del navegador (`tpv_tables`) con la interfaz `TpvTable`. Esto significa que los datos se pierden al limpiar caché, no se comparten entre dispositivos y no se pueden consultar desde el backend (alertas, informes, etc.). Necesitamos un modelo persistente en CouchDB que replique y amplíe los campos actuales.

#### Qué hacer

**1. Definir tipo de documento CouchDB en una DB dedicada de sala**

Usar `getSalaDbName(userId)` → `sala-{userId}` (DB propia, separada de delivery y pay, porque sala es módulo opcional con su propio ciclo de vida).

```typescript
export type DiningTableStatus = 'available' | 'occupied' | 'pending_order' | 'served' | 'pending_payment' | 'unavailable' | 'reserved' | 'hidden';

export interface DiningTable {
  _id: string;              // dining_table:{uuid}
  _rev?: string;
  type: 'dining_table';
  userId: string;
  businessId: string;

  number: number;           // Número visible (1, 2, 3…)
  name?: string;            // Nombre opcional ("Terraza 1", "VIP")
  zone: string;             // Zona del local ("Terraza", "Interior", "Barra")
  zoneResponsible: string;  // Responsable de zona (nombre o userId)
  capacity: number;         // Número de comensales máx (2, 4, 6…)
  currentGuests: number;    // Comensales actuales sentados

  // Posición en el plano
  gridW: number;
  gridH: number;
  x: number;
  y: number;

  status: DiningTableStatus;
  occupiedAt?: string;      // ISO — cuándo se abrió la mesa
  occupiedBy?: string;      // userId del camarero que la abrió

  // Configuración
  sortOrder: number;        // Orden en listado alternativo
  active: boolean;          // soft delete
  tags: string[];           // Etiquetas libres ("fumadores", "ventana", "accesible")

  createdAt: string;
  updatedAt: string;
}
```

**2. Definir tipo para muros y configuración de plano**

```typescript
export interface DiningWall {
  _id: string;              // dining_wall:{uuid}
  _rev?: string;
  type: 'dining_wall';
  userId: string;
  businessId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  label: string;
  createdAt: string;
}

export interface DiningFloorConfig {
  _id: string;              // dining_floor_config:{businessId}
  _rev?: string;
  type: 'dining_floor_config';
  userId: string;
  businessId: string;
  floorWidth: number;       // Ancho del canvas (default 2000)
  floorHeight: number;      // Alto del canvas (default 1200)
  gridSize: number;         // Tamaño de celda (default 20)
  zones: DiningZone[];      // Zonas definidas
  sections: DiningSection[]; // Barras / puntos de recepción
}

export interface DiningZone {
  id: string;
  name: string;             // "Terraza", "Interior", "Privado"
  color: string;
  responsible?: string;
}

export interface DiningSection {
  id: string;
  name: string;             // "Barra 1", "Recepción"
  icon: string;
  active: boolean;
}
```

**3. Crear `src/app/lib/salaApi.ts`**

| Función | Descripción |
|---|---|
| `listDiningTables(userId, businessId)` | Listar mesas activas |
| `getDiningTable(userId, tableId)` | Obtener una mesa por ID |
| `saveDiningTable(userId, data, existing?)` | Crear/editar mesa |
| `deleteDiningTable(userId, tableId)` | Soft delete (`active: false`) |
| `updateTableStatus(userId, tableId, status, extras?)` | Cambiar estado + timestamp |
| `bulkUpdateTables(userId, tables[])` | Guardar posiciones tras drag & drop masivo |
| `listDiningWalls(userId, businessId)` | Listar muros |
| `saveDiningWall(userId, data, existing?)` | Crear/editar muro |
| `deleteDiningWall(userId, wallId)` | Eliminar muro |
| `getFloorConfig(userId, businessId)` | Obtener configuración de plano |
| `saveFloorConfig(userId, data, existing?)` | Guardar configuración de plano |

**4. Crear `routers/salaRouter.js` + `controllers/salaController.js`**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/sala/:userId/tables` | GET | Listar mesas |
| `/api/sala/:userId/tables` | POST | Crear mesa |
| `/api/sala/:userId/tables/bulk` | PUT | Actualizar posiciones masivamente |
| `/api/sala/:userId/tables/:id` | PUT | Actualizar mesa |
| `/api/sala/:userId/tables/:id` | DELETE | Eliminar mesa (soft) |
| `/api/sala/:userId/tables/:id/status` | PATCH | Cambiar estado de mesa |
| `/api/sala/:userId/walls` | GET | Listar muros |
| `/api/sala/:userId/walls` | POST | Crear muro |
| `/api/sala/:userId/walls/:id` | DELETE | Eliminar muro |
| `/api/sala/:userId/floor-config` | GET | Obtener config de plano |
| `/api/sala/:userId/floor-config` | PUT | Guardar config de plano |

**5. Montar router en `index.js`**

```javascript
const salaRouter = require('./routers/salaRouter');
app.use('/api/sala', requireAuth, salaRouter);
```

**6. Migración de datos existentes en localStorage**

Crear helper en el frontend que al cargar la nueva página de sala detecte datos en `tpv_tables`, `tpv_walls`, `tpv_bars` en localStorage, los envíe al servidor vía `saveDiningTable` / `saveDiningWall` / `saveFloorConfig` y marque la migración como completada (`tpv_migrated_to_server: true`).

#### Criterios de aceptación
- [ ] Documentos `dining_table`, `dining_wall`, `dining_floor_config` se persisten en CouchDB
- [ ] CRUD completo funcional vía API y API client
- [ ] Campos `capacity`, `currentGuests`, `occupiedAt`, `occupiedBy` disponibles
- [ ] Estado `reserved` y `pending_payment` añadidos respecto al modelo actual
- [ ] Bulk update de posiciones funciona para drag & drop
- [ ] Migración automática de datos de localStorage al servidor
- [ ] Los datos se comparten entre dispositivos del mismo negocio

---

### SALA-02 — Modelo de datos: Comanda de sala

**Tipo:** Backend + API Client  
**Prioridad:** Crítica  
**Dependencias:** SALA-01

#### Contexto
Actualmente el pedido de sala (`TpvOrder`) vive en `localStorage` y no tiene concepto de "comanda" separada. En hostelería, una mesa puede generar varias comandas (primera ronda, segunda ronda, postres…) que se envían individualmente a cocina. El pedido final es la suma de todas las comandas. Además, los pedidos de sala están completamente desconectados del flujo de delivery (`DeliveryOrder`), por lo que cocina no los ve.

#### Qué hacer

**1. Definir tipo de documento `dining_order` (pedido de mesa)**

```typescript
export type DiningOrderStatus = 'open' | 'served' | 'pending_payment' | 'paid' | 'closed' | 'cancelled';

export interface DiningOrder {
  _id: string;              // dining_order:{uuid}
  _rev?: string;
  type: 'dining_order';
  userId: string;
  businessId: string;

  tableId: string;          // Ref a dining_table
  tableNumber: number;      // Desnormalizado para listados
  tableName?: string;
  zone: string;
  section: string;          // Barra / punto de recepción

  guests: number;           // Comensales en esta mesa
  comandas: DiningComanda[]; // Lista de comandas enviadas

  subtotal: number;         // Suma de todos los ítems de todas las comandas
  discount: number;         // Descuento aplicado (€)
  discountPercent: number;  // Descuento aplicado (%)
  discountReason?: string;
  tax: number;              // IVA calculado
  total: number;            // subtotal - discount + tax

  status: DiningOrderStatus;
  createdBy: string;        // userId del camarero que abrió
  createdByName: string;    // Nombre desnormalizado
  servedAt?: string;        // Cuándo se marcó como servido (todo entregado)
  paidAt?: string;
  closedAt?: string;

  // Cobro
  payments: DiningPayment[];
  splitMode?: 'none' | 'equal' | 'by_item' | 'custom'; // Cómo se dividió la cuenta
  splitCount?: number;      // En cuántas partes se dividió

  // Vinculaciones
  clientId?: string;        // CRM client ID (para historial)
  clientName?: string;
  invoiceGenerated?: boolean;
  financialMovementId?: string; // ID del movimiento en finanzas

  notes: string;
  createdAt: string;
  updatedAt: string;
}
```

**2. Definir tipo `DiningComanda` (comanda individual)**

```typescript
export type ComandaStatus = 'draft' | 'sent_to_kitchen' | 'in_preparation' | 'ready' | 'served' | 'cancelled';

export interface DiningComanda {
  id: string;               // uuid dentro del pedido
  orderNumber: number;      // 1, 2, 3… (número secuencial dentro del pedido)
  items: DiningOrderItem[];
  status: ComandaStatus;
  sentToKitchenAt?: string;
  readyAt?: string;
  servedAt?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  notes?: string;           // Nota general de la comanda ("servir todo junto")
}

export interface DiningOrderItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  notes?: string;           // "Sin gluten", "Poco hecho", "Sin cebolla"
  modifiers?: string[];     // Modificadores seleccionados
  status: 'pending' | 'in_preparation' | 'ready' | 'served' | 'cancelled';
  cancelledReason?: string;
  cancelledBy?: string;
}
```

**3. Definir tipo `DiningPayment` (pago de cuenta)**

```typescript
export interface DiningPayment {
  id: string;
  method: 'efectivo' | 'tarjeta' | 'bizum' | 'transferencia' | 'otro';
  amount: number;
  amountReceived?: number;  // Solo para efectivo
  changeGiven?: number;     // Solo para efectivo
  tip?: number;
  paidBy: string;           // userId del que cobra
  paidByName: string;
  paidAt: string;
  splitLabel?: string;      // "Cuenta 1 de 3", "Menú de Juan"
}
```

**4. Crear endpoints en `salaRouter.js`**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/sala/:userId/orders` | GET | Listar pedidos (filtros: status, tableId, fecha) |
| `/api/sala/:userId/orders` | POST | Crear pedido (abrir mesa) |
| `/api/sala/:userId/orders/:id` | GET | Detalle de pedido |
| `/api/sala/:userId/orders/:id` | PUT | Actualizar pedido |
| `/api/sala/:userId/orders/:id/comanda` | POST | Añadir nueva comanda al pedido |
| `/api/sala/:userId/orders/:id/comanda/:comandaId` | PUT | Editar comanda (antes de enviar a cocina) |
| `/api/sala/:userId/orders/:id/comanda/:comandaId/send` | POST | Enviar comanda a cocina |
| `/api/sala/:userId/orders/:id/comanda/:comandaId/cancel` | POST | Cancelar comanda |
| `/api/sala/:userId/orders/:id/pay` | POST | Registrar pago (parcial o total) |
| `/api/sala/:userId/orders/:id/close` | POST | Cerrar mesa (verificaciones incluidas) |
| `/api/sala/:userId/orders/:id/cancel` | POST | Cancelar pedido completo |

**5. Crear funciones en `salaApi.ts`**

| Función | Descripción |
|---|---|
| `listDiningOrders(userId, filters?)` | Listar pedidos con filtros opcionales |
| `getDiningOrder(userId, orderId)` | Obtener detalle de pedido |
| `createDiningOrder(userId, data)` | Abrir pedido en mesa |
| `updateDiningOrder(userId, orderId, data)` | Actualizar pedido |
| `addComanda(userId, orderId, comanda)` | Añadir comanda |
| `updateComanda(userId, orderId, comandaId, data)` | Editar comanda |
| `sendComandaToKitchen(userId, orderId, comandaId)` | Enviar comanda a cocina (cambia status + timestamp) |
| `cancelComanda(userId, orderId, comandaId, reason)` | Cancelar comanda |
| `payDiningOrder(userId, orderId, payment)` | Registrar pago |
| `closeDiningOrder(userId, orderId)` | Cerrar mesa |
| `cancelDiningOrder(userId, orderId, reason)` | Cancelar pedido |

#### Criterios de aceptación
- [ ] Documento `dining_order` se persiste en CouchDB con todas las comandas como subdocumento
- [ ] Una mesa puede tener múltiples comandas secuenciales (1ª ronda, 2ª ronda…)
- [ ] Cada ítem de comanda admite campo `notes` para observaciones (alergias, preferencias)
- [ ] El total del pedido se recalcula automáticamente al añadir/editar/cancelar comandas
- [ ] Los pagos se registran individualmente para soportar cuentas divididas
- [ ] El estado de la comanda transiciona: `draft` → `sent_to_kitchen` → `in_preparation` → `ready` → `served`
- [ ] No se puede cerrar un pedido si hay importes pendientes de pago
- [ ] Cancelar una comanda ya enviada requiere `cancelledReason`

---

### SALA-03 — Módulo opcional: toggle de activación por negocio

**Tipo:** Backend + Frontend  
**Prioridad:** Alta  
**Dependencias:** SALA-01

#### Contexto
El módulo de sala debe ser opcional. Un negocio de delivery puro no necesita mesas. Actualmente no existe ningún mecanismo para activar/desactivar módulos por negocio. Necesitamos un sistema de feature flags por negocio y que sala sea el primer módulo que lo use.

#### Qué hacer

**1. Ampliar el documento de configuración de negocio**

En el documento de settings del negocio (o crear uno si no existe), añadir:

```typescript
export interface BusinessModules {
  sala: boolean;             // Gestión de sala y mesas
  // Futuros módulos opcionales irán aquí
}

// En el documento de settings existente:
export interface BusinessSettings {
  // ... campos existentes ...
  modules: BusinessModules;
}
```

**2. Endpoint para activar/desactivar módulos**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/settings/:userId/modules` | GET | Obtener módulos activos |
| `/api/settings/:userId/modules` | PUT | Activar/desactivar módulos |

**3. Frontend: lógica de visibilidad**

- En `Sidebar.tsx`: el ítem `sala` solo aparece si `modules.sala === true`.
- En `routes.tsx`: la ruta `/saas/sala` redirige a dashboard si el módulo está desactivado.
- En `Settings.tsx`: sección "Módulos" donde el gerente puede activar/desactivar sala con un toggle.
- Mostrar un card descriptivo del módulo antes de activar: "Gestión de sala — Controla el servicio en local con mapa de mesas, comandas, cobro y conexión con cocina."

**4. Restricción por rol**

- Solo **Admin** y **Gerente** pueden activar/desactivar módulos.
- Los trabajadores ven o no el módulo según el toggle + sus permisos individuales.

#### Criterios de aceptación
- [ ] Toggle de módulo persiste en la configuración del negocio
- [ ] El sidebar oculta/muestra "Sala" según el estado del toggle
- [ ] La ruta `/saas/sala` redirige si el módulo está desactivado
- [ ] Solo Admin/Gerente pueden cambiar el toggle
- [ ] La UI de settings muestra un card descriptivo del módulo
- [ ] Al activar por primera vez se crea la DB de sala y la config de plano por defecto

---

### SALA-04 — Página de Sala: vista principal con mapa y listado

**Tipo:** Frontend  
**Prioridad:** Crítica  
**Dependencias:** SALA-01, SALA-02, SALA-03

#### Contexto
Actualmente la vista de mesas está embebida en `TpvTab.tsx` (1787 líneas) junto con la lógica de TPV/caja. Necesitamos una página independiente `/saas/sala` con su propio componente, optimizada para el flujo de servicio en sala. La vista actual del plano en `TpvTab` se puede reutilizar como base pero debe separarse y ampliarse.

#### Qué hacer

**1. Crear `src/app/pages/saas/SalaPage.tsx`**

Página contenedora con:
- Header con título "Sala", indicador de módulo activo, nombre del operador activo.
- Dos modos de visualización conmutables: **Mapa** (plano canvas como el actual) y **Listado** (tabla/grid de cards).
- KPIs superiores en cards: mesas ocupadas / total, comensales actuales, pedidos abiertos, facturación del turno.
- Barra de filtros: por zona, por estado de mesa, búsqueda por número.

**2. Vista Mapa (por defecto)**

Basada en el canvas actual de `TpvTab` pero como componente separado `DiningFloorMap.tsx`:
- Canvas con grid, zoom (scroll + botones), drag & drop de mesas.
- Mesas con indicador visual de estado (colores existentes + nuevos: `reserved`, `pending_payment`).
- Al hacer clic en mesa → abre panel lateral derecho con detalle de esa mesa.
- Muros decorativos con dibujo libre (mantener funcionalidad actual).
- Badge en cada mesa: número de comensales, tiempo de ocupación ("45 min"), icono si tiene comanda pendiente.
- Indicador pulsante en mesas con alerta (ej: servido hace >15 min sin cobrar).

**3. Vista Listado (alternativa)**

Grid de cards o tabla responsive:
- Una card por mesa con: número, zona, estado (chip de color), comensales, total actual, tiempo ocupada, camarero asignado.
- Ordenable por: número, zona, estado, tiempo.
- Filtrable por los mismos criterios que el mapa.
- Acción rápida desde la card: abrir mesa, ver comanda, cobrar.

**4. Panel lateral de mesa (drawer derecho)**

Al seleccionar una mesa en cualquier vista:
- Cabecera: número de mesa, zona, estado con chip, capacidad, tiempo ocupada.
- Si está **disponible**: botón "Abrir mesa" con campo de comensales.
- Si está **ocupada**: lista de comandas con sus ítems, botón "Nueva comanda", botón "Enviar a cocina", total parcial.
- Si está **servida**: resumen del pedido, botón "Cobrar", botón "Nueva comanda" (postre, café).
- Si está **pending_payment**: resumen + formulario de cobro.
- Notas de mesa (campo libre).
- Historial reciente de la mesa (últimos 5 pedidos).
- Acciones: cambiar estado, mover comensales, asignar camarero, vincular cliente CRM.

**5. Registrar ruta y sidebar**

- `routes.tsx`: `{ path: 'sala', Component: SalaPage }` bajo el bloque SaaS.
- `Sidebar.tsx`: nuevo ítem `sala` con icono `<UtensilsCrossed>` (lucide) en el grupo `delivery`, entre `tpv-locales` y `delivery`.
- `i18n.ts`: traducciones `sala: 'Sala'` en es/en/pt/fr/it.

**6. Componentes a crear**

| Componente | Ubicación | Descripción |
|---|---|---|
| `SalaPage.tsx` | `pages/saas/` | Página contenedora principal |
| `DiningFloorMap.tsx` | `components/saas/sala/` | Canvas de plano de mesas (extraído y mejorado de TpvTab) |
| `DiningTableCard.tsx` | `components/saas/sala/` | Card de mesa para vista listado |
| `DiningTableDetail.tsx` | `components/saas/sala/` | Panel lateral con detalle de mesa |
| `DiningKPIBar.tsx` | `components/saas/sala/` | Barra de KPIs superiores |
| `DiningFilters.tsx` | `components/saas/sala/` | Barra de filtros (zona, estado, búsqueda) |

#### Criterios de aceptación
- [ ] Ruta `/saas/sala` accesible desde el sidebar (si módulo activo)
- [ ] Vista mapa funcional con todas las features del canvas actual
- [ ] Vista listado como alternativa al mapa, con cards y filtros
- [ ] KPIs visibles: mesas ocupadas, comensales, pedidos abiertos, facturación turno
- [ ] Panel lateral se abre al seleccionar una mesa
- [ ] Panel lateral muestra diferentes acciones según estado de la mesa
- [ ] Responsive: en móvil la vista listado es la principal, mapa en horizontal/tablet
- [ ] Traducciones en los 5 idiomas del sistema

---

### SALA-05 — Flujo de apertura de mesa y comanda

**Tipo:** Frontend + Backend  
**Prioridad:** Crítica  
**Dependencias:** SALA-02, SALA-04

#### Contexto
Actualmente al añadir un producto a una mesa en `TpvTab`, se crea directamente un pedido. No hay proceso de "abrir mesa" ni de crear comandas separadas. En hostelería real, el camarero abre la mesa (registra comensales), crea comandas por rondas y las envía a cocina explícitamente.

#### Qué hacer

**1. Flujo de apertura de mesa**

1. Camarero toca mesa disponible → modal "Abrir mesa":
   - Número de comensales (obligatorio).
   - Zona / sección (prellenado según mesa).
   - Vincular cliente CRM (opcional — buscador por nombre/teléfono).
   - Notas (opcional).
2. Al confirmar → se crea `DiningOrder` con status `open`, mesa pasa a `occupied`, se registra `occupiedAt` y `occupiedBy`.

**2. Flujo de comanda**

1. Con la mesa abierta, camarero pulsa "Nueva comanda" → se abre selector de productos:
   - Catálogo agrupado por categorías (tabs o accordion).
   - Buscador rápido de productos.
   - Al tocar producto → se añade al borrador de comanda con qty 1.
   - Tap repetido → incrementa qty.
   - Swipe/botón para decrementar o eliminar.
   - Campo de notas por ítem (tap largo o icono de nota): "Sin gluten", "Extra queso", "Poco hecho".
   - Campo de nota general de comanda: "Servir todo junto", "Primero los entrantes".
2. Botón **"Enviar a cocina"** → comanda pasa de `draft` a `sent_to_kitchen`:
   - POST `/api/sala/:userId/orders/:id/comanda/:comandaId/send`.
   - Se emite evento SSE `sala:comanda_sent` para que cocina lo reciba.
   - Toast de confirmación: "Comanda #2 enviada a cocina".
3. Botón **"Guardar borrador"** → se guarda sin enviar (para completar después).
4. Cada comanda siguiente se numera: Comanda #1, Comanda #2, etc.

**3. Vista de comandas en el panel de mesa**

- Cada comanda aparece como un bloque colapsable con:
  - Número de comanda y hora de creación.
  - Estado con chip de color (draft gris, sent amarillo, in_preparation naranja, ready verde, served azul).
  - Lista de ítems con qty, precio y notas.
  - Si `draft`: botones "Editar" y "Enviar a cocina".
  - Si `sent_to_kitchen` o posterior: solo lectura con indicador de progreso.
- Total acumulado del pedido visible en la parte inferior del panel.

#### Criterios de aceptación
- [ ] Modal de apertura de mesa con campo de comensales obligatorio
- [ ] Se puede vincular opcionalmente un cliente de CRM al abrir mesa
- [ ] Selector de productos con categorías, búsqueda y notas por ítem
- [ ] Las comandas se crean como borrador (`draft`) antes de enviar
- [ ] Botón "Enviar a cocina" cambia status y emite evento SSE
- [ ] Las comandas se numeran secuencialmente dentro del pedido
- [ ] Total del pedido se recalcula en tiempo real al añadir/editar ítems
- [ ] Se puede crear una nueva comanda sin cerrar la anterior (rondas)

---

### SALA-06 — Integración con cocina: envío y sincronización

**Tipo:** Backend + Frontend  
**Prioridad:** Crítica  
**Dependencias:** SALA-02, SALA-05

#### Contexto
Los pedidos de sala y los de delivery son actualmente sistemas completamente separados. `Delivery.tsx` tiene una pestaña "Vista de cocina" que muestra pedidos delivery con estados `preparing` → `kitchen` → `assembly`. Los pedidos de sala no aparecen ahí. Necesitamos que la vista de cocina sea unificada: muestre tanto pedidos de delivery como comandas de sala, y que los cambios de estado en cocina se reflejen en tiempo real en la pantalla de sala.

#### Qué hacer

**1. Unificar la vista de cocina**

En `Delivery.tsx` (pestaña cocina) o en un nuevo componente `KitchenView.tsx`:
- Añadir sección/tab para comandas de sala junto a los pedidos delivery.
- Cada comanda de sala se muestra como una tarjeta con:
  - Badge "SALA" + número de mesa (ej: "SALA — Mesa 5").
  - Hora de recepción y tiempo transcurrido.
  - Lista de ítems con notas resaltadas.
  - Botones de transición: "Preparando" → "Lista".
- Los pedidos delivery mantienen su badge "DELIVERY" + nombre cliente.
- Filtro rápido: "Todo", "Sala", "Delivery", "Recogida".
- Ordenación por antigüedad (FIFO por defecto).

**2. Transiciones de estado desde cocina**

Cuando cocina marca una comanda como "en preparación" o "lista":
- Se actualiza `comanda.status` en el `DiningOrder` del servidor.
- Se emite evento SSE `sala:comanda_status_changed` con `{ orderId, comandaId, newStatus }`.
- La pantalla de sala recibe el evento y actualiza la UI en tiempo real.

**3. Transiciones de estado automáticas en mesa**

- Cuando **todas** las comandas de un pedido están en status `ready`: la mesa pasa automáticamente a `served`.
- Cuando **todas** las comandas están en `served`: se puede ofrecer el cobro proactivamente.
- El backend ejecuta esta lógica en el endpoint de cambio de estado de comanda.

**4. Eventos SSE para sala**

Ampliar el endpoint SSE existente (`/api/sse`) con nuevos tipos de evento:

| Evento | Payload | Quién lo emite | Quién lo escucha |
|---|---|---|---|
| `sala:comanda_sent` | `{ orderId, comandaId, tableNumber, items }` | Sala (al enviar) | Cocina |
| `sala:comanda_status_changed` | `{ orderId, comandaId, status, tableNumber }` | Cocina (al cambiar) | Sala |
| `sala:table_status_changed` | `{ tableId, status, occupiedBy }` | Backend (automático) | Sala (todos los dispositivos) |
| `sala:order_updated` | `{ orderId, tableId }` | Backend | Sala (todos los dispositivos) |
| `sala:comanda_cancelled` | `{ orderId, comandaId, reason }` | Sala | Cocina |

**5. Hook `useSalaSSE` en frontend**

```typescript
export function useSalaSSE(businessId: string, handlers: SalaSSEHandlers) {
  // Reutilizar la infraestructura de useSSE.ts
  // Filtrar eventos que empiecen por 'sala:'
  // Invocar handlers: onComandaSent, onComandaStatusChanged, onTableStatusChanged, onOrderUpdated
}
```

#### Criterios de aceptación
- [ ] La vista de cocina muestra comandas de sala junto a pedidos de delivery
- [ ] Las comandas de sala se distinguen visualmente con badge "SALA — Mesa X"
- [ ] Al marcar una comanda como "lista" en cocina, la mesa de sala se actualiza en tiempo real
- [ ] Cuando todas las comandas están listas, la mesa pasa automáticamente a `served`
- [ ] Los eventos SSE se emiten y reciben correctamente
- [ ] Múltiples dispositivos ven los cambios en tiempo real (camarero tablet + cocina pantalla)
- [ ] Filtro en cocina para ver solo sala, solo delivery, o todo
- [ ] La cancelación de una comanda desde sala llega a cocina con motivo

---

### SALA-07 — Separación y unión de cuentas

**Tipo:** Frontend + Backend  
**Prioridad:** Alta  
**Dependencias:** SALA-02

#### Contexto
Actualmente no existe la posibilidad de dividir la cuenta de una mesa ni de unir cuentas de varias mesas. En hostelería es muy habitual que un grupo quiera pagar por separado o que dos mesas se junten para una celebración.

#### Qué hacer

**1. Separación de cuentas (split)**

Tres modos de separación:

**a) División equitativa:**
- El camarero indica el número de partes (ej: 4 personas → 4 cuentas iguales).
- El sistema divide `total / N` y genera N pagos pendientes.
- Cada pago se puede cobrar con método distinto.

**b) División por ítem:**
- Se muestra la lista de todos los ítems del pedido.
- El camarero asigna cada ítem a una "cuenta" (1, 2, 3…) con drag & drop o tap.
- Un mismo ítem con qty > 1 se puede repartir (ej: 3 cervezas → 2 para cuenta 1, 1 para cuenta 2).
- Cada cuenta tiene su subtotal independiente.

**c) División personalizada:**
- El camarero introduce manualmente el importe de cada cuenta.
- Validación: la suma de todas las cuentas debe igualar el total del pedido.

**2. Unión de cuentas (merge)**

- Desde el panel de una mesa, botón "Unir con otra mesa".
- Se abre un selector con las mesas actualmente ocupadas.
- Al seleccionar mesa(s) a unir:
  - Todos los ítems de las mesas seleccionadas se consolidan en un solo pedido.
  - Las mesas origen se cierran y quedan disponibles.
  - La mesa destino mantiene el pedido unificado.
- Validación: solo se pueden unir mesas con pedidos en status `open` o `served`.

**3. UI del modal de cobro con split**

- Al pulsar "Cobrar" en una mesa:
  - Sección superior: total del pedido.
  - Tabs: "Cuenta única" | "Dividir cuenta".
  - Si "Dividir cuenta" → selector de modo (equitativa / por ítem / personalizada).
  - Para cada sub-cuenta: método de pago, importe recibido, cambio.
  - Indicador de progreso: "Cobrado 2 de 4 cuentas (175,00€ de 350,00€)".
  - Solo se puede cerrar la mesa cuando se han cobrado todas las sub-cuentas.

**4. Endpoints**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/sala/:userId/orders/:id/split` | POST | Dividir cuenta (body: mode, parts, assignments) |
| `/api/sala/:userId/orders/merge` | POST | Unir pedidos de varias mesas (body: sourceOrderIds, targetOrderId) |

**5. Funciones en `salaApi.ts`**

| Función | Descripción |
|---|---|
| `splitDiningOrder(userId, orderId, mode, config)` | Dividir cuenta |
| `mergeDiningOrders(userId, sourceOrderIds, targetOrderId)` | Unir pedidos |

#### Criterios de aceptación
- [ ] División equitativa calcula correctamente total / N con redondeo al céntimo
- [ ] División por ítem permite asignar ítems individuales o fracciones a cuentas
- [ ] División personalizada valida que la suma iguale el total
- [ ] Cada sub-cuenta se puede cobrar con método de pago diferente
- [ ] La mesa no se puede cerrar hasta que todas las sub-cuentas estén pagadas
- [ ] Unir mesas consolida los pedidos correctamente y libera las mesas origen
- [ ] Solo se pueden unir mesas con pedidos en estado `open` o `served`
- [ ] El historial refleja la división/unión con los detalles de cada pago

---

### SALA-08 — Cobro de mesa y cierre formal

**Tipo:** Frontend + Backend  
**Prioridad:** Alta  
**Dependencias:** SALA-02, SALA-07

#### Contexto
Actualmente el cobro en `TpvTab` es simple: seleccionar método de pago, introducir importe recibido, calcular cambio e imprimir ticket. No hay verificación previa, no genera movimiento financiero, no hay cierre formal de la mesa, y el paso de "servido" a "entregado" al cerrar no existe.

#### Qué hacer

**1. Proceso de cobro completo**

1. Camarero pulsa "Cobrar" → se abre `DiningPaymentModal`:
   - Resumen del pedido: ítems agrupados por comanda, subtotal, descuento (si se aplicó), IVA, **total**.
   - Opción de aplicar descuento (porcentaje o importe fijo) con campo de motivo.
   - Selector de split si aplica (SALA-07).
   - Para cada pago (o pago único):
     - Método: efectivo, tarjeta, bizum, transferencia, otro.
     - Si efectivo: campo "Recibido" + cálculo de cambio automático.
     - Campo de propina opcional.
   - Botón "Cobrar" (o "Cobrar cuenta X de N" si split).
   - Checkbox "Imprimir ticket" (activo por defecto).
   - Checkbox "Generar factura" (para vincular con CRM).

2. Al confirmar cobro:
   - Se registra el `DiningPayment` en el pedido.
   - Si el pago cubre el total: pedido pasa a `paid`.
   - Se genera el ticket de impresión (mejorar `printReceipt` actual con datos de comanda, descuento, propina).

**2. Proceso de cierre de mesa**

El cierre es un paso explícito después del cobro:

1. Tras cobrar → botón "Cerrar mesa" aparece:
   - Verificaciones automáticas antes de cerrar:
     - Todas las comandas en estado `served` o `cancelled`.
     - Todos los pagos completos (total pagado >= total pedido).
     - No hay comandas en cocina pendientes.
   - Si alguna verificación falla → aviso con detalle y opción de forzar cierre (con motivo).
2. Al cerrar:
   - Pedido pasa a status `closed`, se registra `closedAt`.
   - Mesa pasa a status `available`, se limpian `occupiedAt`, `occupiedBy`, `currentGuests`.
   - Se emite evento SSE `sala:table_status_changed`.
   - Todos los ítems con status `served` pasan a `served` (confirmación final).

**3. Conexión con finanzas (Caja)**

Al completar el cobro:
- Si el módulo de finanzas está activo → crear automáticamente un `FinanceMovementRecord` de tipo ingreso:
  - Concepto: "Sala — Mesa #X".
  - Importe: total cobrado.
  - Método: según el pago.
  - Categoría: "Ventas sala".
  - `linkedDiningOrderId`: ID del pedido de sala.
- El movimiento se vincula al pedido: `DiningOrder.financialMovementId`.
- Si hay split, se genera un movimiento por cada pago o uno consolidado (configurable).

**4. Ticket de impresión mejorado**

Ampliar `printReceipt` actual para incluir:
- Nombre del negocio y datos fiscales (si configurados en settings).
- Detalle por comanda: "— Comanda 1 —", ítems…, "— Comanda 2 —", ítems…
- Subtotal, descuento (si aplica), IVA, **total**.
- Propina (si aplica).
- Método de pago, recibido, cambio.
- Si split: detalle de cada sub-cuenta.
- QR de valoración (opcional, si configurado).
- NIF del cliente (si vinculado CRM y factura solicitada).

#### Criterios de aceptación
- [ ] Modal de cobro con resumen completo del pedido por comandas
- [ ] Soporte para descuento (% o fijo) con motivo obligatorio
- [ ] Métodos de pago: efectivo, tarjeta, bizum, transferencia, otro
- [ ] Cálculo de cambio automático para efectivo
- [ ] Campo de propina opcional
- [ ] Cierre de mesa con verificaciones automáticas (comandas servidas, pago completo)
- [ ] Cierre forzado con motivo si las verificaciones fallan
- [ ] Al cerrar: mesa pasa a available, evento SSE emitido
- [ ] Se genera movimiento financiero automáticamente si el módulo está activo
- [ ] Ticket mejorado con desglose por comanda, descuento, propina y datos fiscales

---

### SALA-09 — Recogida local (takeaway) visible en sala

**Tipo:** Frontend + Backend  
**Prioridad:** Media  
**Dependencias:** SALA-04, SALA-06

#### Contexto
Los pedidos de recogida en local ("takeaway") se gestionan actualmente solo desde `Delivery.tsx`. Si un negocio tiene servicio de sala, los pedidos de recogida deberían ser visibles también desde la pantalla de sala, para que el personal de sala pueda avisar al cliente cuando su pedido esté listo.

#### Qué hacer

**1. Sección "Recogidas" en la página de sala**

- Debajo del mapa/listado de mesas, o como tab separado, añadir sección "Recogidas pendientes".
- Mostrar los pedidos de delivery con tipo `pickup` / `takeaway` que estén en estado `ready` o `assembly`.
- Cada card de recogida muestra: nombre del cliente, hora estimada, número de pedido, estado.
- Al marcar como "Entregado" desde sala: el pedido delivery transiciona a `delivered`.

**2. Endpoint para consultar recogidas**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/sala/:userId/pickups` | GET | Listar pedidos de recogida pendientes (proxy a delivery orders filtrados) |
| `/api/sala/:userId/pickups/:orderId/deliver` | POST | Marcar recogida como entregada |

**3. Indicador en KPIs**

Añadir en la barra de KPIs de sala: "Recogidas pendientes: N".

**4. Notificación cuando llega recogida**

Si el pedido pickup pasa a `ready` y la pantalla de sala está abierta:
- Notificación toast: "Recogida lista — Pedido #123 (Nombre)".
- Evento SSE `delivery:pickup_ready` escuchado por la pantalla de sala.

#### Criterios de aceptación
- [ ] Los pedidos de recogida pendientes aparecen en la pantalla de sala
- [ ] Se pueden marcar como entregados desde sala (sin ir a Delivery)
- [ ] KPI de recogidas pendientes visible
- [ ] Notificación en tiempo real cuando una recogida está lista
- [ ] Solo aparecen recogidas en estado `ready` o `assembly`, no todas

---

### SALA-10 — Permisos: clave `sala` en la matriz de permisos

**Tipo:** Backend + Frontend  
**Prioridad:** Alta  
**Dependencias:** SALA-03

#### Contexto
Actualmente `ROLE_PERMISSION_OPTIONS` en `roleCatalog.ts` no tiene una clave `sala`. Solo existe `tpv` como permiso más cercano. Para que el gerente pueda controlar quién accede al módulo de sala y quién puede operar mesas, necesitamos un permiso específico.

#### Qué hacer

**1. Añadir clave `sala` a `ROLE_PERMISSION_OPTIONS`**

```typescript
export const ROLE_PERMISSION_OPTIONS = [
  // ... existentes ...
  { key: 'sala', label: 'Sala', description: 'Gestión de mesas, comandas y cobro en sala' },
] as const;
```

**2. Lógica de permisos en sala**

| Permiso | `view` | `edit` |
|---|---|---|
| `sala.view` = true | Puede ver el plano de mesas y el estado de sala | — |
| `sala.edit` = true | Puede abrir/cerrar mesas, crear comandas, cobrar | — |

**3. Actualizar roles predefinidos**

- **Admin** / **Gerente**: `sala: { view: true, edit: true }`.
- **Comercial** / **Administración**: `sala: { view: true, edit: false }`.
- **Usuario (trabajador)**: `sala: { view: false, edit: false }` por defecto; el gerente lo activa manualmente.
- **Taller**: `sala: { view: false, edit: false }`.

**4. Añadir clave `sala` a `TEAM_PERMISSION_KEYS` en `couchdb.js`**

Para que el backend valide el permiso.

**5. Proteger endpoints**

Middleware que verifica `permissions.sala.edit` antes de permitir operaciones de escritura en `/api/sala/:userId/*`.

**6. Proteger UI**

- `Sidebar.tsx`: ítem `sala` solo visible si `permissionMap.sala?.view !== false`.
- `SalaPage.tsx`: si `!permissions.sala?.edit`, ocultar botones de acción (abrir mesa, cobrar, etc.) y mostrar la sala en modo solo lectura.

#### Criterios de aceptación
- [ ] Clave `sala` añadida a `ROLE_PERMISSION_OPTIONS`
- [ ] Roles predefinidos actualizados con valores por defecto para `sala`
- [ ] Sidebar oculta/muestra sala según permiso `view`
- [ ] Acciones de escritura protegidas por permiso `edit`
- [ ] Endpoints backend protegidos por middleware de permisos
- [ ] El gerente puede asignar permisos de sala a trabajadores individuales desde Team

---

### SALA-11 — Alertas de sala

**Tipo:** Backend  
**Prioridad:** Alta  
**Dependencias:** SALA-01, SALA-02

#### Contexto
El motor de alertas (`alertEngine.js`) ejecuta checks periódicos y genera alertas para diversos módulos (stock bajo, facturas vencidas, etc.). Necesitamos añadir checks específicos de sala para detectar situaciones que requieren atención.

#### Qué hacer

**1. Alerta: mesa abierta sin cobro (larga ocupación)**

```javascript
async function checkLongOccupiedTables(userId) {
  // Buscar mesas con status 'occupied' o 'served' donde occupiedAt > X horas
  // Umbral configurable (default: 3 horas para restaurante, 1.5 horas para fast-food)
  // Generar alerta tipo 'long_occupied_table'
  // Mensaje: "Mesa #5 lleva 3h 45min abierta sin cobrar"
}
```

**2. Alerta: pedido servido pendiente de cierre**

```javascript
async function checkServedPendingClose(userId) {
  // Buscar pedidos con status 'served' donde servedAt > X minutos
  // Umbral configurable (default: 30 minutos)
  // Generar alerta tipo 'served_pending_close'
  // Mensaje: "Mesa #12 servida hace 45min — pendiente de cobro"
}
```

**3. Alerta: comanda en cocina demasiado tiempo**

```javascript
async function checkSlowKitchenComandas(userId) {
  // Buscar comandas con status 'sent_to_kitchen' o 'in_preparation' donde sentToKitchenAt > X minutos
  // Umbral configurable (default: 25 minutos)
  // Generar alerta tipo 'slow_kitchen_comanda'
  // Mensaje: "Comanda #2 de Mesa #8 lleva 30min en cocina"
}
```

**4. Alerta: incidencia de sala**

```javascript
async function checkSalaIncidents(userId) {
  // Buscar comandas con ítems cancelados (status 'cancelled') no resueltas
  // Buscar pedidos con descuento forzado sin motivo
  // Generar alerta tipo 'sala_incident'
  // Mensaje: "Incidencia en Mesa #3: 2 ítems cancelados"
}
```

**5. Registrar en `alertEngine.js`**

Añadir las 4 funciones al array de checks del motor de alertas:

```javascript
const salaChecks = [
  checkLongOccupiedTables,
  checkServedPendingClose,
  checkSlowKitchenComandas,
  checkSalaIncidents,
];
```

Solo ejecutar si el módulo de sala está activo para el negocio.

**6. Umbrales configurables**

En la configuración del negocio (settings), añadir:

```typescript
export interface SalaAlertThresholds {
  longOccupiedMinutes: number;    // Default: 180 (3h)
  servedPendingCloseMinutes: number; // Default: 30
  slowKitchenMinutes: number;     // Default: 25
  enableIncidentAlerts: boolean;  // Default: true
}
```

#### Criterios de aceptación
- [ ] Alerta `long_occupied_table` se genera cuando una mesa lleva más de X horas abierta
- [ ] Alerta `served_pending_close` se genera cuando una mesa servida lleva más de X minutos sin cobrar
- [ ] Alerta `slow_kitchen_comanda` se genera cuando una comanda lleva más de X minutos en cocina
- [ ] Alerta `sala_incident` se genera para cancelaciones e incidencias
- [ ] Los umbrales son configurables por negocio
- [ ] Las alertas solo se ejecutan si el módulo de sala está activo
- [ ] Las alertas aparecen en el dashboard del gerente y en la pantalla de sala

---

### SALA-12 — Actualización automática del estado de mesa

**Tipo:** Backend + Frontend  
**Prioridad:** Media  
**Dependencias:** SALA-02, SALA-06

#### Contexto
Actualmente el estado de mesa se cambia solo manualmente. En un flujo real, muchas transiciones deberían ser automáticas para reducir trabajo del camarero y mantener la información actualizada.

#### Qué hacer

**1. Transiciones automáticas (backend)**

Implementar lógica de transición automática en `salaController.js`:

| Evento disparador | Transición de mesa | Transición de pedido |
|---|---|---|
| Se crea un pedido en la mesa | `available` → `occupied` | Pedido creado con status `open` |
| Se envía la primera comanda a cocina | (sin cambio) | Comanda: `draft` → `sent_to_kitchen` |
| Cocina marca comanda como "preparando" | (sin cambio) | Comanda: `sent_to_kitchen` → `in_preparation` |
| Cocina marca comanda como "lista" | Si **todas** las comandas están `ready` → mesa pasa a `served` | Comanda: `in_preparation` → `ready` |
| Camarero marca comanda como "servida" | Si **todas** las comandas están `served` → mesa pasa a `pending_payment` | Comanda: `ready` → `served` |
| Se registra pago total | Mesa permanece en `pending_payment` | Pedido: `open` → `paid` |
| Se cierra la mesa | `pending_payment` → `available` | Pedido: `paid` → `closed` |
| Se cancela el pedido | `occupied` → `available` | Pedido → `cancelled`, comandas activas → `cancelled` |

**2. Emitir SSE en cada transición**

Cada transición automática emite `sala:table_status_changed` para que todos los dispositivos se actualicen.

**3. Indicadores visuales de tiempo**

En la mesa del plano y en el listado:
- Mostrar cronómetro de ocupación: `0:05`, `0:45`, `1:30:00`.
- Cambiar color del cronómetro según umbrales:
  - < 1h: gris (normal).
  - 1h–2h: amarillo (atención).
  - > 2h: rojo (revisar).
- El cronómetro se calcula en frontend a partir de `occupiedAt` con un `setInterval`.

**4. Indicador de "etapa" en mesa**

Mostrar un mini-flujo visual en la card/plano de cada mesa ocupada:
- Iconos: Comanda → Cocina → Servido → Cobro.
- Resaltar la etapa actual.
- Si hay múltiples comandas en distintas etapas, mostrar la más retrasada.

#### Criterios de aceptación
- [ ] Mesa transiciona automáticamente según la tabla de transiciones
- [ ] Todas las transiciones automáticas emiten evento SSE
- [ ] Cronómetro de ocupación visible en cada mesa
- [ ] Colores del cronómetro cambian según umbrales
- [ ] Mini-flujo visual de etapas visible en cada mesa ocupada
- [ ] La transición automática no interfiere con cambios manuales (el camarero siempre puede forzar un estado)

---

### SALA-13 — Conexión con CRM: vincular cliente a mesa

**Tipo:** Frontend + Backend  
**Prioridad:** Media  
**Dependencias:** SALA-02

#### Contexto
Actualmente no hay forma de vincular un cliente de CRM a una mesa o pedido de sala. Para fidelización, historial de consumo y facturación personalizada, necesitamos esta conexión.

#### Qué hacer

**1. Vincular cliente al abrir mesa**

En el modal de "Abrir mesa" (SALA-05), campo opcional "Cliente":
- Buscador por nombre, email o teléfono (reutilizar componente de búsqueda de clientes existente).
- Autocompletar con datos de CRM.
- Si no existe, opción "Crear cliente rápido" (nombre + teléfono mínimo).
- Se guarda `clientId` y `clientName` en el `DiningOrder`.

**2. Vincular cliente en cualquier momento**

En el panel lateral de mesa, botón "Asignar cliente" disponible mientras la mesa esté abierta.

**3. Historial de consumo en CRM**

En la ficha de cliente (`ClientDetail.tsx`), nueva pestaña o sección "Historial de sala":
- Listado de visitas: fecha, mesa, importe, ítems pedidos, camarero.
- KPIs del cliente: total gastado en sala, visitas, ticket medio, último pedido, productos más pedidos.

**4. Datos para factura**

Al cobrar, si hay cliente vinculado:
- Pre-rellenar datos de factura (NIF, dirección) desde el CRM.
- Opción de generar factura automática vinculada al cliente.

**5. Endpoint**

| Ruta | Método | Descripción |
|---|---|---|
| `/api/sala/:userId/orders/:id/client` | PUT | Vincular/desvincular cliente a pedido |

#### Criterios de aceptación
- [ ] Se puede vincular un cliente de CRM al abrir mesa o en cualquier momento
- [ ] Buscador de clientes con autocompletado
- [ ] Opción de crear cliente rápido si no existe
- [ ] Historial de sala visible en la ficha de cliente CRM
- [ ] KPIs de cliente en sala: total gastado, visitas, ticket medio
- [ ] Al cobrar con cliente vinculado, se pre-rellenan datos de factura
- [ ] Al desvincular un cliente, el historial previo se mantiene

---

### SALA-14 — Vista de gerente: dashboard y control total

**Tipo:** Frontend  
**Prioridad:** Media  
**Dependencias:** SALA-04, SALA-11

#### Contexto
El gerente necesita una visión global del estado de la sala: todas las mesas, camareros activos, alertas, rendimiento del servicio. Además, debe poder activar/desactivar el módulo y configurar los parámetros de sala.

#### Qué hacer

**1. Dashboard de sala (sección superior de SalaPage para gerente)**

Visible solo si el usuario tiene rol Admin o Gerente. Cards de KPIs expandidos:

| KPI | Cálculo |
|---|---|
| Mesas ocupadas / Total mesas | Count por status |
| Comensales actuales | Sum de `currentGuests` de mesas ocupadas |
| Facturación del turno | Sum de `total` de pedidos `paid` o `closed` del día |
| Ticket medio | Facturación / pedidos cerrados |
| Tiempo medio de ocupación | Media de `closedAt - occupiedAt` de pedidos cerrados del día |
| Comandas en cocina | Count de comandas con status `sent_to_kitchen` o `in_preparation` |
| Alertas activas | Count de alertas de sala no resueltas |
| Camareros activos | Count de operadores que han abierto mesa en las últimas 2h |

**2. Panel de alertas de sala**

- Lista de alertas activas con acción rápida (ir a mesa, resolver, silenciar).
- Código de color por gravedad.
- Filtro por tipo de alerta.

**3. Rendimiento por camarero**

- Tabla: camarero, mesas atendidas hoy, facturación, ticket medio, tiempo medio.
- Accesible desde un botón "Rendimiento equipo" en el dashboard.

**4. Configuración de sala (acceso desde Settings)**

- Umbrales de alertas (SALA-11).
- Zonas y secciones (crear/editar/eliminar).
- Configuración de plano (dimensiones, grid).
- Productos visibles en sala.
- Horarios de servicio de sala (si aplica).

#### Criterios de aceptación
- [ ] Dashboard con KPIs expandidos visible para Admin/Gerente
- [ ] Panel de alertas con acciones rápidas
- [ ] Tabla de rendimiento por camarero
- [ ] Acceso a configuración completa de sala desde Settings
- [ ] Los trabajadores sin rol gerente ven la sala simplificada (solo mapa + operación)

---

### SALA-15 — Migración del TPV Locales: mantener compatibilidad

**Tipo:** Frontend  
**Prioridad:** Media  
**Dependencias:** SALA-04

#### Contexto
La ruta actual `/saas/tpv/locales` renderiza `TpvTab` con `view='locales'`. Al crear la nueva página `/saas/sala`, necesitamos decidir qué pasa con la ruta antigua y con la vista de TPV que combina caja y plano.

#### Qué hacer

**1. Redirección de ruta antigua**

- `/saas/tpv/locales` → redirigir a `/saas/sala` si el módulo de sala está activo.
- Si el módulo no está activo, mantener la ruta actual como fallback.
- Mantener la entrada en `routes.tsx` con un componente wrapper que decide.

**2. Limpiar `TpvTab.tsx`**

Una vez que `/saas/sala` esté operativo:
- Eliminar la vista `locales` del componente `TpvTab.tsx` (queda solo `tpv` para caja).
- Mover los sub-componentes compartidos (canvas, modales) a componentes reutilizables.
- `TpvTab` se simplifica significativamente (~800 líneas menos).

**3. Actualizar sidebar**

- Si módulo sala activo: reemplazar item `tpv-locales` por `sala` en el grupo delivery.
- Si módulo sala inactivo: mantener `tpv-locales` como está.

**4. Actualizar referencias cruzadas**

- En `TpvTab.tsx` hay botones que enlazan a `/saas/tpv/locales` (ej: "Créalas en Locales") → actualizar a `/saas/sala`.
- Cualquier otra referencia a `tpv/locales` en el código.

#### Criterios de aceptación
- [ ] `/saas/tpv/locales` redirige a `/saas/sala` si el módulo está activo
- [ ] Si el módulo no está activo, la ruta antigua sigue funcionando
- [ ] `TpvTab.tsx` queda limpio sin la lógica de plano de mesas
- [ ] Componentes reutilizables extraídos (canvas, modales)
- [ ] Sidebar se actualiza dinámicamente según el estado del módulo
- [ ] No hay enlaces rotos a la ruta antigua

---

## Resumen de dependencias

```
SALA-01 (Modelo mesa)
  ├── SALA-02 (Modelo comanda) ──→ SALA-05 (Apertura + comanda UI)
  │     ├── SALA-06 (Integración cocina)
  │     ├── SALA-07 (Split/merge cuentas)
  │     ├── SALA-08 (Cobro + cierre)
  │     ├── SALA-11 (Alertas)
  │     ├── SALA-12 (Auto-estados)
  │     └── SALA-13 (CRM)
  ├── SALA-03 (Módulo opcional) ──→ SALA-10 (Permisos)
  └── SALA-04 (Página principal UI)
        ├── SALA-05, SALA-09 (Recogida), SALA-14 (Gerente), SALA-15 (Migración TPV)
```

## Orden de implementación recomendado

| Fase | Tickets | Descripción |
|---|---|---|
| **Fase 1 — Base** | SALA-01, SALA-02 | Modelos de datos persistentes en servidor |
| **Fase 2 — Módulo** | SALA-03, SALA-10 | Toggle de activación + permisos |
| **Fase 3 — UI principal** | SALA-04, SALA-05 | Página de sala + flujo de apertura/comanda |
| **Fase 4 — Cocina** | SALA-06, SALA-12 | Integración cocina + auto-estados |
| **Fase 5 — Cobro** | SALA-07, SALA-08 | Split/merge + cobro formal + cierre |
| **Fase 6 — Conexiones** | SALA-09, SALA-11, SALA-13, SALA-14 | Recogida, alertas, CRM, dashboard gerente |
| **Fase 7 — Migración** | SALA-15 | Limpiar TPV Locales y redirigir |
