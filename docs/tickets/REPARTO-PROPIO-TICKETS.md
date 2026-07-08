# REPARTO PROPIO OPCIONAL — Plan de Tickets

**Página:** `/saas/vertical/delivery/reparto`
**Objetivo:** Gestionar pedidos a domicilio con repartidores propios del negocio.
**Tipo:** Módulo opcional dentro de la vertical Delivery.
**Fecha:** 2026-04-14

## Estado auditado (08/07/2026)

~65% hecho. Completo: entidad `Driver` + CRUD + stats (REP-01/02/03), página `DeliveryReparto.tsx` con vistas gerente/trabajador, asignación manual con modal (Recomendado/Saturado), flujo iniciar ruta → entregado → cobrado con `departedAt`/`deliveredAt` (usa estado dedicado `en_reparto`, más allá del ticket), 4 de 5 alertas client-side, Maps/Llamar/WhatsApp y "Modo repartidor" para gerente. Datos en vivo por SSE + polling 30s (`useDeliveryOrdersLive`).
Falta de verdad: enlace "Reparto" en la sidebar (la página existe en `/saas/vertical/delivery/reparto` pero no está en `Sidebar.tsx`), panel de configuración/zonas en UI (el backend `reparto_config` sí existe), auto-assign solo por carga (sin modos proximity/hybrid ni ETA), casi todo REP-14 (conexiones CRM/Equipo/Dashboard) y REP-15 (feature flag `ownDeliveryEnabled` existe en backend pero nada lo usa para gatear UI). Ojo: el endpoint `/drivers/:userId/stats` devuelve un shape distinto al tipo `DriverStats` del frontend (no incluye `assignedCount`), lo que afecta a la alerta de repartidor saturado.

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| CRUD de pedidos delivery (backend) | Completo | `deliveryRouter.js` → `deliveryController.js` — DB `*-delivery` |
| Modelo `DeliveryOrder` con campo `assignedDriver` | Parcial | `deliveryApi.ts` — solo es un `string`, no referencia a entidad |
| Flujo de estados del pedido | Completo | `pending → preparing → kitchen → assembly → delivery → delivered` |
| Tab "Reparto" dentro de Delivery.tsx | Básico | `Delivery.tsx` línea 1675 — lista plana de pedidos en estado `delivery` |
| Asignación de repartidor (clic → input nombre) | Básico | `Delivery.tsx` — modal con `assignedDriver` como texto libre |
| Caja de repartidor (apertura, cobros, cierre) | Completo | `deliveryApi.ts` `DriverCashSession` + CRUD completo + UI en tab |
| Cobro rápido desde caja de repartidor | Completo | `Delivery.tsx` — quick charge por método de pago |
| Contacto: enlace a teléfono (`tel:`) y Google Maps | Parcial | `Delivery.tsx` — solo `tel:` y link a Maps, no WhatsApp |
| Marcar "Entregado" | Completo | `Delivery.tsx` — botón avanza estado a `delivered` |
| Incidencias | Completo | `Delivery.tsx` — tab con creación, timeline y resolución |
| Historial con exportar CSV | Completo | `Delivery.tsx` — filtros fecha + tabla + export |
| Prototipos avanzados de reparto | Mock/Prototipo | `src-delivery/` — `RepartoTabNew.tsx`, `RepartoTabGerente.tsx` (datos mock, no integrado) |
| Roles de UI en prototipo | Mock/Prototipo | `src-delivery/` — `gerente`, `cocina`, `reparto`, `caja` (sin conexión a auth) |
| Sidebar con sección vertical Delivery | Completo | `Sidebar.tsx` — grupo "Vertical: Delivery" con permisos por `businessType` |
| Sistema de roles backend | Completo | `ROLE_DEFINITIONS` en `couchdb.js` — Admin, Gerente, Comercial, etc. |
| Login de equipo (modo worker) | Completo | `TeamLogin.tsx` + rutas `/saas/worker/*` |
| CRM con clientes | Completo | Rutas `/saas/crm/clientes` + API |
| Equipo con fichajes y horarios | Completo | Rutas `/saas/team` + APIs |
| Dashboard general | Completo | `Dashboard.tsx` con lectura de pedidos delivery |
| Montaje con checklist | Completo | Tab en `Delivery.tsx` — checklist de 7 ítems |

### Lo que FALTA

| Funcionalidad | Estado |
|---|---|
| Entidad `Repartidor` como documento propio (no solo string) | No existe |
| Página independiente `/saas/vertical/delivery/reparto` | No existe (es un tab dentro de `Delivery.tsx`) |
| Feature flag para activar/desactivar módulo Reparto | No existe |
| Vista gerente: panel de control con toggle "por pedidos / por repartidores" | No existe en app principal |
| Vista trabajador: solo sus entregas o las de su turno | No existe |
| Filtros por repartidor, zona, tiempo | No existen |
| Asignación automática de repartidor (carga/cercanía) | No existe |
| Cálculo de tiempo estimado de entrega | No existe |
| Campo `departedAt` (hora de salida) en `DeliveryOrder` | No existe — solo hay `deliveredAt` |
| Campo `estimatedDeliveryMinutes` en `DeliveryOrder` | No existe |
| Acción de contacto WhatsApp | No existe |
| Estado intermedio "En ruta" diferenciado de "En reparto" | No diferenciado — `delivery` cubre ambos |
| Alertas: pedido listo sin salir | No existe |
| Alertas: reparto retrasado | No existe |
| Alertas: repartidor saturado | No existe |
| Alertas: entrega fallida | No existe |
| Alertas: pedido entregado sin cobro | No existe |
| Gerente actuando como repartidor | No existe |
| Conexión bidireccional con CRM (historial cliente ↔ entregas) | No existe |
| Conexión Dashboard con métricas de reparto | No existe |
| Conexión Equipo: repartidores activos por turno | No existe |

---

## Tickets

---

### REP-01 — Modelo de datos: Entidad Repartidor

**Tipo:** Backend + API Client
**Prioridad:** Crítica (bloquea todo)
**Dependencias:** Ninguna

#### Contexto

Actualmente `assignedDriver` en `DeliveryOrder` es un `string` con el nombre del repartidor. No hay entidad propia, por lo que no se puede:
- Saber cuántos pedidos tiene asignados un repartidor.
- Filtrar por repartidor con ID estable.
- Vincular con miembros del equipo (`team`).
- Gestionar estado (activo/offline), zona asignada, ni carga máxima.

Necesitamos un documento CouchDB `driver` en la DB `*-delivery` que represente al repartidor como entidad de primer nivel.

#### Qué hacer

**1. Definir tipo de documento CouchDB en `*-delivery`**

```typescript
export interface Driver {
  _id: string;
  _rev?: string;
  type: 'driver';
  id: string;
  user_id: string;               // ID de la cuenta (owner del negocio)
  teamMemberId?: string;          // Enlace con miembro del equipo (opcional)
  name: string;
  phone: string;
  email?: string;
  avatar?: string;                // URL o base64 miniatura
  status: 'active' | 'offline' | 'on_break' | 'unavailable';
  zones: string[];                // Zonas asignadas (códigos postales o nombres de zona)
  maxConcurrentOrders: number;    // Máximo de pedidos simultáneos (default 3)
  vehicleType?: 'moto' | 'coche' | 'bicicleta' | 'a_pie' | 'otro';
  currentLocation?: {
    lat: number;
    lng: number;
    updatedAt: string;
  };
  stats: {
    totalDelivered: number;
    averageDeliveryMinutes: number;
    rating?: number;              // 1-5 si se implementa feedback
  };
  isManager: boolean;             // true si es el gerente actuando como repartidor
  active: boolean;                // true = puede recibir asignaciones
  createdAt: string;
  updatedAt: string;
}
```

**2. Ampliar `DeliveryOrder` con campos de reparto**

Añadir estos campos al tipo `DeliveryOrder` existente en `deliveryApi.ts`:

```typescript
// Nuevos campos a añadir a DeliveryOrder
driverId?: string;                // ID del documento driver (reemplaza assignedDriver como referencia)
assignedDriver: string;           // Mantener para retrocompatibilidad (nombre)
departedAt?: string;              // Hora de salida del local
estimatedDeliveryMinutes?: number;// Tiempo estimado de entrega en minutos
estimatedArrivalAt?: string;      // Hora estimada de llegada
zone?: string;                    // Zona de entrega (CP o nombre)
deliveryDistance?: number;        // Distancia en km (calculada o manual)
paymentCollected?: boolean;       // Si el cobro ya fue realizado
paymentCollectedAt?: string;      // Cuándo se cobró
paymentCollectedBy?: string;      // Quién cobró (driverId)
```

**3. Añadir a `services/couchdb.js`**

- Función `buildDriverDocument(data)` — Construye documento `driver` con valores por defecto.
- Función `sanitizeDriver(doc)` — Limpia y valida campos.
- Vista CouchDB `by_type` → `driver` para listar repartidores.

**4. Migración suave**

- Los pedidos existentes con `assignedDriver` como string siguen funcionando.
- El nuevo campo `driverId` se usa cuando el repartidor tiene entidad propia.
- La UI muestra `assignedDriver` como fallback si no hay `driverId`.

#### Criterios de aceptación
- [x] Documento `driver` se persiste en `*-delivery` de CouchDB
- [x] `DeliveryOrder` tiene los nuevos campos sin romper pedidos existentes
- [x] `buildDriverDocument` y `sanitizeDriver` en `couchdb.js`
- [ ] Vista CouchDB creada para listar drivers por `user_id` (se usa `listDriversByUser`, no verificada vista dedicada)

---

### REP-02 — Backend API: Endpoints de repartidores

**Tipo:** Backend (Express)
**Prioridad:** Crítica (bloquea REP-03)
**Dependencias:** REP-01

#### Contexto

Necesitamos CRUD completo para la entidad `Driver` en `deliveryRouter.js` y `deliveryController.js`, siguiendo el mismo patrón que ya existe para `orders`, `catalog`, `suppliers`, etc.

#### Qué hacer

**1. Añadir rutas en `deliveryRouter.js`**

```javascript
deliveryRouter.get('/drivers/:userId', listDrivers);
deliveryRouter.post('/drivers/:userId', createDriver);
deliveryRouter.put('/drivers/:userId/:driverId', updateDriver);
deliveryRouter.delete('/drivers/:userId/:driverId', removeDriver);
```

**2. Implementar controladores en `deliveryController.js`**

| Función | Descripción |
|---|---|
| `listDrivers` | Lista todos los repartidores del `userId`, incluyendo stats calculados |
| `createDriver` | Crea repartidor con `buildDriverDocument()` |
| `updateDriver` | Actualiza repartidor (estado, zonas, ubicación, etc.) |
| `removeDriver` | Elimina repartidor (soft delete: `active: false`) |

**3. Endpoint extra: stats en tiempo real**

```javascript
deliveryRouter.get('/drivers/:userId/stats', getDriversStats);
```

Este endpoint devuelve para cada repartidor activo:
- Número de pedidos asignados (estado `delivery`)
- Número de pedidos "en ruta" (con `departedAt` pero sin `deliveredAt`)
- Total a cobrar en efectivo pendiente
- Último pedido entregado (hora)

#### Criterios de aceptación
- [x] CRUD de drivers funcional bajo `/api/delivery/drivers/:userId`
- [ ] Stats endpoint devuelve datos en tiempo real cruzando con pedidos (existe y cruza con pedidos, pero el shape no coincide con `DriverStats`: devuelve `totalOrders/delivered/pending`, sin `assignedCount` ni `pendingCashAmount`)
- [x] Misma estructura de respuesta que otros endpoints delivery (`{ ok, drivers }`)
- [x] `requireAuth` y limiters aplicados (ya están en el montaje del router en `index.js`)

---

### REP-03 — API Client + Tipos TypeScript: Repartidores

**Tipo:** Frontend (API Client)
**Prioridad:** Crítica (bloquea todos los tickets de UI)
**Dependencias:** REP-01, REP-02

#### Contexto

Crear las funciones de API client en `deliveryApi.ts` para consumir los nuevos endpoints de repartidores, y actualizar los tipos TypeScript.

#### Qué hacer

**1. Añadir tipo `Driver` a `deliveryApi.ts`**

El tipo definido en REP-01 (interface `Driver`).

**2. Añadir funciones API**

```typescript
export async function listDriversRequest(userId: string): Promise<Driver[]>
export async function createDriverRequest(userId: string, data: Partial<Driver>): Promise<Driver>
export async function updateDriverRequest(userId: string, driver: Driver): Promise<Driver>
export async function deleteDriverRequest(userId: string, driverId: string): Promise<void>
export async function getDriversStatsRequest(userId: string): Promise<DriverStats[]>
```

**3. Tipo `DriverStats`**

```typescript
export interface DriverStats {
  driverId: string;
  driverName: string;
  assignedCount: number;
  inRouteCount: number;
  deliveredTodayCount: number;
  pendingCashAmount: number;
  lastDeliveredAt?: string;
  status: Driver['status'];
}
```

**4. Actualizar tipo `DeliveryOrder`**

Añadir los campos nuevos (`driverId`, `departedAt`, `estimatedDeliveryMinutes`, `estimatedArrivalAt`, `zone`, `deliveryDistance`, `paymentCollected`, `paymentCollectedAt`, `paymentCollectedBy`) al interface existente.

#### Criterios de aceptación
- [x] Tipo `Driver` exportado desde `deliveryApi.ts`
- [x] Tipo `DriverStats` exportado
- [x] 5 funciones API client funcionando con los endpoints
- [x] `DeliveryOrder` actualizado con nuevos campos (opcionales)
- [ ] Sin romper compilación TypeScript en componentes existentes (no verificado con build)

---

### REP-04 — Página Reparto: Estructura base + ruta SPA

**Tipo:** Frontend (React + Router)
**Prioridad:** Alta
**Dependencias:** REP-03

#### Contexto

Actualmente "Reparto" es un tab dentro de `Delivery.tsx` (línea 1675). El usuario necesita una **página independiente** accesible desde la sidebar, con su propia ruta y layout, que funcione como centro de mando para toda la operativa de reparto.

La URL de producción será `/saas/vertical/delivery/reparto` pero en el router SPA la ruta se define relativa al layout SaaS.

#### Qué hacer

**1. Crear página `src/app/pages/saas/DeliveryReparto.tsx`**

Componente principal que:
- Detecta el rol del usuario (gerente vs trabajador/repartidor).
- Renderiza la vista correspondiente (REP-05 para gerente, REP-06 para trabajador).
- Carga datos iniciales: pedidos en estados `assembly` (listos para salir) y `delivery` (en reparto), repartidores, y stats.
- Implementa polling cada 30s para actualizar datos en tiempo real.

**2. Registrar ruta en `src/app/routes.tsx`**

```typescript
{ path: 'vertical/delivery/reparto', lazy: () => import('../pages/saas/DeliveryReparto') }
```

**3. Añadir a sidebar en `Sidebar.tsx`**

Dentro del grupo "Vertical: Delivery", añadir enlace:
- Icono: `Truck` de lucide-react
- Label: "Reparto"
- Ruta: `/saas/vertical/delivery/reparto`
- Solo visible si el módulo reparto está activado (feature flag de REP-16)

**4. Layout de la página**

```
┌─────────────────────────────────────────────────────┐
│  Reparto propio                          [?] Ayuda  │
│  Gestión de entregas con repartidores propios       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─── KPIs ────────────────────────────────────┐   │
│  │ Listos para  │ En ruta │ Entregados │ A cobrar│  │
│  │ salir (3)    │ (2)     │ hoy (15)   │ 47.50€ │  │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [Vista gerente / Vista trabajador según rol]       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**5. KPIs de cabecera (siempre visibles)**

| KPI | Cálculo | Color |
|---|---|---|
| Listos para salir | Pedidos en estado `assembly` con checklist completado + pedidos `delivery` sin `departedAt` | Amber |
| En ruta | Pedidos `delivery` con `departedAt` y sin `deliveredAt` | Cyan |
| Entregados hoy | Pedidos `delivered` con `deliveredAt` de hoy | Green |
| A cobrar | Suma de `totalAmount` de pedidos `delivered` hoy con `paymentCollected: false` y método efectivo | Red/Amber |
| Repartidores activos | Repartidores con `status: 'active'` | Blue |

**6. Hook de datos: `useRepartoData`**

Extraer la lógica de carga en un hook reutilizable:

```typescript
function useRepartoData() {
  // Carga pedidos (filtrados por estados relevantes)
  // Carga repartidores
  // Carga stats
  // Polling cada 30s
  // Returns: { orders, drivers, stats, loading, refresh }
}
```

#### Criterios de aceptación
- [x] Página accesible en `/saas/vertical/delivery/reparto` (también `/saas/delivery-reparto`)
- [ ] Aparece en sidebar bajo "Vertical: Delivery" (no hay enlace "Reparto" en `Sidebar.tsx`)
- [x] KPIs calculados en tiempo real
- [x] Detecta rol y muestra vista correcta
- [x] Polling de datos cada 30s (SSE con fallback de polling a 30s vía `useDeliveryOrdersLive`)
- [x] Layout responsive (mobile-first)
- [x] Dark mode compatible

---

### REP-05 — Vista Gerente: Panel de control de repartos

**Tipo:** Frontend (React)
**Prioridad:** Alta
**Dependencias:** REP-04

#### Contexto

El gerente necesita visibilidad total: ver todos los repartos, saber quién lleva qué, reasignar si hace falta, y detectar problemas rápido. Inspirado en los prototipos de `RepartoTabGerente.tsx` pero integrado con datos reales y el sistema de auth.

#### Qué hacer

**1. Toggle de vista: "Por pedidos" / "Por repartidores"**

Colocar debajo de los KPIs un toggle con dos modos:

```
[📦 Por pedidos]  [👤 Por repartidores]
```

**2. Vista "Por pedidos" (default)**

Listado unificado de pedidos en estados relevantes para reparto:

**Filtros (barra horizontal de chips/selects compactos):**
| Filtro | Opciones |
|---|---|
| Estado | Todos · Listo para salir · Asignado · En ruta · Entregado hoy |
| Repartidor | Todos · [lista de repartidores activos] · Sin asignar |
| Zona | Todas · [zonas según CPs de pedidos] |
| Tiempo | Todos · < 15 min · 15-30 min · 30-60 min · > 60 min |
| Pago | Todos · Efectivo pendiente · Cobrado · Online/tarjeta |

**Card de pedido (diseño compacto, mobile-first):**

```
┌──────────────────────────────────────────────────┐
│  #0042  ·  María García             🔴 Urgente   │
│  ─────────────────────────────────────────────── │
│  📍 C/ Mayor 15, 3ºA — 28001 Madrid             │
│     2.3 km · ETA 12 min                          │
│  ─────────────────────────────────────────────── │
│  👤 Pedro (repartidor)    💶 Efectivo · 23.50€   │
│  ─────────────────────────────────────────────── │
│  [Asignar/Reasignar]  [Detalle]  [📞] [💬 WA]  │
└──────────────────────────────────────────────────┘
```

Cada card muestra:
- Número de pedido + nombre cliente + badge de prioridad
- Dirección completa (1-2 líneas) + distancia + ETA
- Repartidor asignado (avatar/iniciales + nombre) o "Sin asignar" en naranja
- Método de pago + importe + estado de cobro
- Notas del pedido (si existen, icono expandible)
- Tiempo transcurrido desde que está listo (timeSince)

Acciones por pedido (iconos + texto en desktop, solo iconos en mobile):
| Acción | Descripción |
|---|---|
| Asignar / Reasignar | Abre modal con lista de repartidores (REP-07) |
| Ver detalle | Drawer lateral con info completa del pedido |
| Llamar | `tel:` al cliente |
| WhatsApp | Link `wa.me/` al cliente (REP-10) |
| Incidencia | Modal de reporte de incidencia |

**3. Vista "Por repartidores"**

Grid/lista de tarjetas de repartidor:

```
┌─────────────────────────────────────────┐
│  👤 Pedro Martínez           🟢 Activo  │
│  ────────────────────────────────────── │
│  📦 Asignados: 2  🚚 En ruta: 1        │
│  ✅ Entregados: 8  💶 A cobrar: 15.00€ │
│  ────────────────────────────────────── │
│  [Ver pedidos ▼]                        │
└─────────────────────────────────────────┘
```

Cada tarjeta de repartidor muestra:
- Nombre + avatar/iniciales
- Estado: activo (verde), offline (gris), en descanso (amarillo)
- Contadores: asignados, en ruta, entregados hoy
- Total a cobrar en efectivo pendiente
- Al expandir: lista de pedidos asignados con acciones rápidas

Incluir tarjeta especial **"Sin asignar"** al principio con los pedidos que no tienen repartidor.

**4. Layout responsive**

- **Mobile (< 768px):** Todo en columna única, cards full-width, toggle arriba.
- **Tablet (768-1024px):** Grid de 2 columnas para cards.
- **Desktop (> 1024px):** Vista "por repartidores" puede ser 2 paneles: izquierda lista repartidores, derecha pedidos del seleccionado.

**5. Búsqueda global**

Input de búsqueda que filtra por: número de pedido, nombre de cliente, dirección, teléfono, nombre de repartidor.

#### Criterios de aceptación
- [x] Toggle "Por pedidos / Por repartidores" funcional
- [ ] Filtros completos: estado, repartidor, zona, tiempo, pago (hay estado, repartidor, pago y búsqueda; faltan zona y tiempo)
- [x] Cards de pedido con toda la info requerida
- [x] Cards de repartidor con stats en tiempo real
- [x] Expansión inline o drawer al clic en repartidor
- [x] Tarjeta "Sin asignar" visible
- [x] Búsqueda global funcional
- [x] Responsive en mobile, tablet y desktop
- [x] Dark mode compatible

---

### REP-06 — Vista Trabajador (repartidor): Mis entregas

**Tipo:** Frontend (React)
**Prioridad:** Alta
**Dependencias:** REP-04

#### Contexto

Cuando un repartidor accede a la página de reparto (via login de equipo o worker mode), solo debe ver **sus pedidos asignados** o los del turno actual. La interfaz debe ser minimalista, orientada a acción rápida (una mano, en movimiento).

#### Qué hacer

**1. Detección del repartidor actual**

- Si el usuario logueado tiene `teamMemberId`, buscar en repartidores cuál tiene ese `teamMemberId`.
- Si es login de equipo (worker mode), usar el `workerId` del contexto.
- Si no hay match, mostrar mensaje "No tienes perfil de repartidor asignado" con botón de contactar gerente.

**2. Sub-tabs del repartidor**

```
[Pendientes (3)]  [En ruta (1)]  [Entregados (8)]
```

| Sub-tab | Contenido |
|---|---|
| Pendientes | Pedidos asignados a este repartidor con estado `delivery` y sin `departedAt` |
| En ruta | Pedidos con `departedAt` y sin `deliveredAt` |
| Entregados | Pedidos entregados hoy por este repartidor |

**3. Card de pedido (vista repartidor — mobile-optimized)**

```
┌──────────────────────────────────────────────────┐
│  #0042  ·  María García              ⏱ 8 min     │
│  📍 C/ Mayor 15, 3ºA, Madrid                     │
│  📞 +34 612 345 678                               │
│  📝 "Portero automático código 4321"              │
│  ─────────────────────────────────────────────── │
│  💶 Efectivo · 23.50€ · ⚠ Sin cobrar             │
│  ─────────────────────────────────────────────── │
│  [📍 Abrir Maps]  [📞 Llamar]  [💬 WhatsApp]    │
│  ─────────────────────────────────────────────── │
│  [▶ INICIAR RUTA]  (botón grande, color cyan)    │
└──────────────────────────────────────────────────┘
```

Cada card muestra prominentemente:
- Dirección completa + notas de entrega (código portero, piso, etc.)
- Teléfono del cliente (clicable)
- Método de pago + importe + si está cobrado o pendiente
- Tiempo estimado o transcurrido

**4. Acciones principales (botones grandes, touch-friendly)**

| Estado del pedido | Acción principal | Lo que hace |
|---|---|---|
| Asignado (sin `departedAt`) | **Iniciar ruta** | Registra `departedAt = now()`, cambia badge a "En ruta" |
| En ruta | **Marcar entregado** | Registra `deliveredAt = now()`, cambia estado a `delivered` |
| Entregado sin cobrar (efectivo) | **Marcar cobrado** | Registra `paymentCollected = true`, `paymentCollectedAt = now()` |

**5. Acciones secundarias (siempre visibles)**

- **Abrir en Maps:** `https://www.google.com/maps/dir/?api=1&destination={address}` (con dirección a la que ir, no solo buscar)
- **Llamar:** `tel:{phone}`
- **WhatsApp:** `https://wa.me/{phone}` (REP-10)
- **Reportar problema:** Modal de incidencia simplificado

**6. KPIs compactos del repartidor (header)**

```
┌──────────────────────────────────────┐
│  Hoy: 📦 3 pendientes · 🚚 1 ruta  │
│        ✅ 8 entregados · 💶 15.00€  │
└──────────────────────────────────────┘
```

**7. Sin acceso a:**
- Reasignar pedidos de otros
- Ver pedidos de otros repartidores
- Gestionar repartidores
- Cambiar configuración del módulo

#### Criterios de aceptación
- [x] Repartidor solo ve sus pedidos asignados
- [x] Sub-tabs: Pendientes, En ruta, Entregados
- [x] Botón "Iniciar ruta" registra `departedAt`
- [x] Botón "Entregado" registra `deliveredAt` y cambia estado
- [x] Botón "Cobrado" registra pago (solo para efectivo pendiente)
- [x] Maps con modo navegación (dirección, no solo búsqueda)
- [x] Llamar + WhatsApp funcionales
- [x] KPIs del repartidor visibles
- [ ] UI optimizada para uso con una mano en movimiento (no verificado en dispositivo)
- [x] No puede ver ni modificar pedidos de otros

---

### REP-07 — Asignación manual de repartidor

**Tipo:** Frontend (React)
**Prioridad:** Alta
**Dependencias:** REP-03, REP-05

#### Contexto

El gerente debe poder asignar o reasignar un repartidor a cualquier pedido. Actualmente se hace con un input de texto libre (`assignedDriver`). Necesitamos un modal real con lista de repartidores, sus stats en tiempo real, y confirmación.

#### Qué hacer

**1. Modal de asignación**

Se abre desde:
- Botón "Asignar" en card de pedido (vista gerente).
- Botón "Reasignar" si ya tiene repartidor.
- Card de repartidor "Sin asignar" (seleccionando pedidos).

**2. Contenido del modal**

```
┌─────────────────────────────────────────────────┐
│  Asignar repartidor                          ✕  │
│  Pedido #0042 — María García · 23.50€           │
│  📍 C/ Mayor 15, 3ºA, Madrid · 2.3 km          │
│ ─────────────────────────────────────────────── │
│  🔍 Buscar repartidor...                        │
│ ─────────────────────────────────────────────── │
│  ┌──────────────────────────────────────────┐   │
│  │ 🟢 Pedro M.    📦 2 asignados  🚚 1     │   │
│  │    Zona: Centro  ·  Moto                 │   │
│  │    [Asignar]                              │   │
│  ├──────────────────────────────────────────┤   │
│  │ 🟢 Laura G.    📦 1 asignados  🚚 0     │   │
│  │    Zona: Norte   ·  Bicicleta            │   │
│  │    [Asignar]               ⭐ Recomendado │   │
│  ├──────────────────────────────────────────┤   │
│  │ 🟡 Carlos R.   📦 3 asignados  🚚 2     │   │
│  │    Zona: Centro  ·  Coche                │   │
│  │    [Asignar]               ⚠ Saturado    │   │
│  └──────────────────────────────────────────┘   │
│ ─────────────────────────────────────────────── │
│  [Cancelar]                                     │
└─────────────────────────────────────────────────┘
```

**3. Indicadores de recomendación**

Ordenar repartidores con lógica de sugerencia:
1. Primero los que tienen zona compatible con el CP del pedido.
2. Luego por menor número de pedidos asignados.
3. Marcar con "Recomendado" al mejor candidato.
4. Marcar con "Saturado" a los que tienen `>= maxConcurrentOrders`.
5. Los repartidores `offline` o `on_break` aparecen al final, deshabilitados.

**4. Al asignar:**

- Actualizar `DeliveryOrder`: `driverId`, `assignedDriver` (nombre), `zone` (del CP).
- Si el pedido estaba en `assembly`, cambiar estado a `delivery`.
- Añadir evento al `stageHistory`: `{ status: 'delivery', user: gerente, notes: 'Asignado a Pedro M.' }`.
- Toast de confirmación.

**5. Asignación múltiple**

Desde la vista "Por repartidores", permitir seleccionar varios pedidos sin asignar y asignarlos a un repartidor de golpe con un botón "Asignar seleccionados a...".

#### Criterios de aceptación
- [x] Modal muestra lista real de repartidores con stats
- [ ] Indicador "Recomendado" basado en zona + carga (existe, pero solo por estado activo + carga; no considera zona)
- [x] Indicador "Saturado" para repartidores al límite
- [x] Repartidores offline/break aparecen deshabilitados
- [x] La asignación actualiza `driverId` + `assignedDriver` + `stageHistory`
- [ ] Pedido en `assembly` pasa a `delivery` al asignar (la asignación no cambia el estado; el flujo actual usa estados en español `listo`/`en_reparto`)
- [ ] Asignación múltiple funcional
- [x] Búsqueda de repartidor en el modal

---

### REP-08 — Asignación automática de repartidor

**Tipo:** Backend + Frontend
**Prioridad:** Media
**Dependencias:** REP-01, REP-02, REP-07

#### Contexto

Cuando se activa la asignación automática, el sistema sugiere o asigna directamente el mejor repartidor disponible para cada pedido listo. Dos modos: por carga (menos pedidos) o por cercanía (zona más cercana).

#### Qué hacer

**1. Configuración (documento en CouchDB)**

```typescript
export interface RepartoConfig {
  _id: string;                        // reparto_config:{user_id}
  _rev?: string;
  type: 'reparto_config';
  user_id: string;
  autoAssign: boolean;                // true = asignación automática activa
  autoAssignMode: 'load' | 'proximity' | 'hybrid';
  autoAssignOnAssemblyComplete: boolean; // true = asignar al completar montaje
  maxOrdersPerDriver: number;          // default 3
  alertDelayMinutes: number;           // minutos para alerta "listo sin salir" (default 10)
  alertDeliveryDelayMinutes: number;   // minutos para alerta "reparto retrasado" (default 45)
  zones: DeliveryZone[];               // Zonas configurables
  estimatedMinutesPerKm: number;       // Para cálculo de ETA (default 3)
  basePreparationMinutes: number;      // Tiempo base desde asignación hasta salida (default 5)
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryZone {
  id: string;
  name: string;
  postalCodes: string[];
  baseDeliveryMinutes: number;         // Tiempo base de entrega para esta zona
  surcharge?: number;                  // Recargo de envío para esta zona (€)
}
```

**2. Lógica de asignación (backend)**

Nuevo endpoint:

```javascript
deliveryRouter.post('/drivers/:userId/auto-assign/:orderId', autoAssignDriver);
```

Lógica del algoritmo:
- **Modo "load":** Selecciona repartidor activo con menos pedidos asignados (estado `delivery`, sin `deliveredAt`). Si hay empate, el que lleva más tiempo sin recibir pedido.
- **Modo "proximity":** Selecciona repartidor activo cuya zona (`zones[]`) incluya el CP del pedido. Si hay varios, el de menor carga.
- **Modo "hybrid":** Primero filtra por zona, luego por carga.
- Si ningún repartidor disponible, devuelve `{ ok: false, reason: 'no_drivers_available' }`.

**3. Trigger desde montaje**

Si `autoAssignOnAssemblyComplete: true`, cuando un pedido pasa de `assembly` a `delivery` (en `Delivery.tsx` o el nuevo `DeliveryReparto.tsx`), el frontend llama al endpoint de auto-asignación.

**4. UI de configuración**

Dentro de la página de reparto (accesible solo para gerente), un panel de configuración:

```
⚙ Configuración de reparto
├─ Auto-asignación: [ON/OFF]
│  └─ Modo: [Por carga] [Por cercanía] [Híbrido]
│  └─ Asignar al completar montaje: [ON/OFF]
├─ Máximo pedidos por repartidor: [3]
├─ Alerta "listo sin salir" tras: [10] minutos
├─ Alerta "reparto retrasado" tras: [45] minutos
└─ Zonas de reparto:
   ├─ Centro (28001-28010) — 15 min base — +0€
   ├─ Norte (28020-28040) — 25 min base — +1.50€
   └─ [+ Añadir zona]
```

**5. Cálculo de tiempo estimado**

Al asignar (manual o auto), calcular:

```
estimatedDeliveryMinutes = basePreparationMinutes + zona.baseDeliveryMinutes
estimatedArrivalAt = now() + estimatedDeliveryMinutes
```

Si hay distancia disponible:
```
estimatedDeliveryMinutes = basePreparationMinutes + (distancia_km × estimatedMinutesPerKm)
```

Guardar `estimatedDeliveryMinutes` y `estimatedArrivalAt` en el pedido.

#### Criterios de aceptación
- [x] Documento `reparto_config` con CRUD (`buildRepartoConfigDocument` + GET/PUT `/reparto-config/:userId`)
- [ ] Endpoint `/auto-assign/:orderId` funcional con 3 modos (existe, pero solo asigna por carga; sin proximity/hybrid ni zonas)
- [ ] Trigger automático al completar montaje (si activado)
- [ ] Panel de configuración accesible solo para gerente (no hay UI de configuración; la página solo lee la config)
- [ ] Gestión de zonas con CPs, tiempo base y recargo (soportado en backend, sin UI)
- [ ] Cálculo de ETA al asignar
- [x] Si no hay repartidor disponible, respuesta clara sin error (400 con mensaje "No hay repartidores disponibles")

---

### REP-09 — Filtros avanzados: repartidor, pedido, zona, tiempo

**Tipo:** Frontend (React)
**Prioridad:** Alta
**Dependencias:** REP-05

#### Contexto

El gerente necesita poder filtrar rápido la lista de repartos. Los filtros deben ser combinables, con UX de chips/selects compactos que no ocupen demasiado espacio vertical.

#### Qué hacer

**1. Barra de filtros (diseño)**

```
🔍 Buscar...  | Estado ▼ | Repartidor ▼ | Zona ▼ | Tiempo ▼ | Pago ▼ | [✕ Limpiar]
```

En mobile: los filtros se colapsan en un botón "Filtros" que abre un sheet bottom.

**2. Detalle de cada filtro**

| Filtro | Tipo | Opciones |
|---|---|---|
| Búsqueda | Input texto | Busca en: nº pedido, nombre cliente, dirección, teléfono, repartidor |
| Estado | Select/Chips | Todos · Listo para salir · Asignado sin salir · En ruta · Entregado hoy · Incidencia |
| Repartidor | Select con búsqueda | Todos · Sin asignar · [lista de repartidores] |
| Zona | Select | Todas · [zonas configuradas] · Sin zona |
| Tiempo | Select | Todos · < 15 min · 15-30 min · 30-60 min · > 60 min (tiempo desde creación o desde asignación) |
| Pago | Select | Todos · Efectivo pendiente · Cobrado · Online/Tarjeta |

**3. Lógica de filtrado**

Todos los filtros se aplican en AND. El filtrado es client-side (los datos ya están cargados).

**4. Contadores en filtros**

Cada opción muestra entre paréntesis cuántos pedidos coinciden:
```
Estado: En ruta (3) · Listo para salir (5) · Entregado hoy (12)
```

**5. Persistencia de filtros**

Guardar filtros seleccionados en `sessionStorage` para que persistan al navegar y volver.

**6. URL params**

Opcionalmente, reflejar filtros en query params de la URL para poder compartir un enlace con filtros aplicados:
```
/saas/vertical/delivery/reparto?estado=en_ruta&repartidor=driver-123
```

#### Criterios de aceptación
- [ ] 6 filtros funcionales y combinables (hay 4: búsqueda, estado, repartidor, pago; faltan zona y tiempo)
- [ ] Contadores en cada opción de filtro (solo el filtro de estado los muestra)
- [ ] Mobile: filtros en bottom sheet
- [x] Desktop: barra horizontal compacta
- [x] Búsqueda global en tiempo real
- [ ] Filtros persistidos en sessionStorage
- [ ] Botón "Limpiar filtros" visible cuando hay filtros activos

---

### REP-10 — Contacto: Llamada y WhatsApp

**Tipo:** Frontend (React)
**Prioridad:** Alta
**Dependencias:** REP-04

#### Contexto

El repartidor y el gerente necesitan contactar al cliente rápidamente. Ya existe enlace `tel:` pero falta WhatsApp, y la UX de contacto puede mejorarse con un modal/popover unificado.

#### Qué hacer

**1. Botón de contacto con popover**

Al pulsar el icono de contacto en una card de pedido, mostrar un popover con 3 opciones:

```
┌───────────────────────────┐
│  Contactar a María García │
│  +34 612 345 678          │
│ ─────────────────────────│
│  📞 Llamar                │
│  💬 WhatsApp              │
│  📋 Copiar teléfono       │
└───────────────────────────┘
```

**2. Enlace WhatsApp**

```typescript
function getWhatsAppUrl(phone: string, message?: string): string {
  const cleanPhone = phone.replace(/\s|-|\(|\)/g, '');
  const intlPhone = cleanPhone.startsWith('+') ? cleanPhone.slice(1) : 
                     cleanPhone.startsWith('34') ? cleanPhone : `34${cleanPhone}`;
  const url = `https://wa.me/${intlPhone}`;
  if (message) return `${url}?text=${encodeURIComponent(message)}`;
  return url;
}
```

**3. Mensajes predefinidos de WhatsApp**

Al pulsar WhatsApp, opcionalmente mostrar selector de mensaje predefinido:

| Mensaje | Texto |
|---|---|
| En camino | "Hola {nombre}, soy el repartidor de {negocio}. Tu pedido #{número} está en camino. Llegaré en aprox. {eta} minutos." |
| He llegado | "Hola {nombre}, he llegado con tu pedido #{número}. Estoy en la puerta." |
| No encuentro | "Hola {nombre}, soy el repartidor de {negocio}. Estoy en tu dirección pero no encuentro la entrada. ¿Puedes indicarme?" |
| Personalizado | Input libre |

**4. Enlace de llamada**

```html
<a href="tel:+34612345678">📞 Llamar</a>
```

**5. Copiar al portapapeles**

```typescript
navigator.clipboard.writeText(phone);
toast.success('Teléfono copiado');
```

**6. Contacto desde drawer de detalle**

En el drawer de detalle de pedido (tanto en vista gerente como trabajador), mostrar los mismos botones de contacto de forma prominente.

#### Criterios de aceptación
- [ ] Popover de contacto con 3 opciones (llamar, WhatsApp, copiar) — hay botones directos Llamar/WhatsApp, sin popover ni copiar
- [x] Link WhatsApp genera URL correcta con prefijo internacional (`waUrl` en `DeliveryReparto.tsx`)
- [ ] Mensajes predefinidos de WhatsApp con variables reemplazadas
- [ ] Copiar teléfono al portapapeles con feedback
- [x] Funciona tanto en vista gerente como trabajador
- [x] En mobile: WhatsApp y llamar abren la app nativa directamente (enlaces `tel:` y `wa.me`)

---

### REP-11 — Flujo de estados: En ruta y Entregado con registro de tiempos

**Tipo:** Backend + Frontend
**Prioridad:** Alta
**Dependencias:** REP-01, REP-06

#### Contexto

Actualmente el estado `delivery` cubre todo desde "listo para salir" hasta "en ruta". Necesitamos diferenciar claramente y registrar tiempos para métricas y alertas.

#### Qué hacer

**1. No crear un nuevo estado — usar campos**

Mantener el estado `delivery` pero diferenciar con los campos `departedAt` y `deliveredAt`:

| Condición | Significado visual | Badge |
|---|---|---|
| `status: 'delivery'` y `departedAt` vacío | "Listo para salir" o "Asignado" | Amber |
| `status: 'delivery'` y `departedAt` con valor | "En ruta" | Cyan pulsante |
| `status: 'delivered'` | "Entregado" | Green |

Esto evita crear un nuevo estado que rompería el flujo existente (`NEXT_STATUS` en `Delivery.tsx`).

**2. Acción "Iniciar ruta" (repartidor o gerente)**

Al pulsar "Iniciar ruta":

```typescript
const updatedOrder = {
  ...order,
  departedAt: new Date().toISOString(),
  stageHistory: [
    ...order.stageHistory,
    { status: 'delivery', date: new Date().toISOString(), user: currentUserName, notes: 'Repartidor inició ruta' }
  ]
};
await updateDeliveryOrderRequest(userId, updatedOrder);
```

**3. Acción "Marcar entregado"**

Al pulsar "Entregado":

```typescript
const updatedOrder = {
  ...order,
  status: 'delivered' as DeliveryOrderStatus,
  deliveredAt: new Date().toISOString(),
  stageHistory: [
    ...order.stageHistory,
    { status: 'delivered', date: new Date().toISOString(), user: currentUserName, notes: 'Pedido entregado' }
  ]
};
await updateDeliveryOrderRequest(userId, updatedOrder);
```

**4. Confirmación con detalles**

Al marcar entregado, modal de confirmación rápida:

```
┌──────────────────────────────────────┐
│  ✅ Confirmar entrega                │
│  Pedido #0042 — María García         │
│                                      │
│  ¿Se cobró el pedido?               │
│  [Sí, efectivo] [Sí, tarjeta] [No]  │
│                                      │
│  Notas (opcional):                   │
│  [________________________]          │
│                                      │
│  [Cancelar]  [Confirmar entrega]     │
└──────────────────────────────────────┘
```

**5. Registro de duración**

Calcular y guardar automáticamente:

| Campo | Cálculo |
|---|---|
| Tiempo total del pedido | `deliveredAt - createdAt` |
| Tiempo de reparto | `deliveredAt - departedAt` |
| Tiempo en espera (listo sin salir) | `departedAt - assemblyCompletedAt` |

Estos datos se usan en el historial, métricas del dashboard y stats del repartidor.

**6. Actualizar stats del repartidor**

Cuando un pedido se marca como entregado, recalcular:
- `driver.stats.totalDelivered += 1`
- `driver.stats.averageDeliveryMinutes` = media ponderada incluyendo esta nueva entrega

#### Criterios de aceptación
- [ ] "Iniciar ruta" registra `departedAt` sin cambiar `status` (registra `departedAt` pero SÍ cambia el estado: se implementó un estado dedicado `en_reparto`, superando el ticket)
- [x] "Entregado" registra `deliveredAt` y cambia `status` a `delivered` (equivalente en español: `entregado`)
- [ ] Modal de confirmación con opción de cobro (el marcado de entrega es directo, sin modal; el cobro es un botón aparte)
- [x] `stageHistory` actualizado con cada acción
- [ ] Stats del repartidor recalculadas al entregar (las stats se calculan al vuelo en el endpoint, no se persisten en `driver.stats`)
- [ ] Duración calculada disponible en historial
- [ ] El tab "Reparto" de `Delivery.tsx` sigue funcionando (retrocompatible) — `Delivery.tsx` ya no existe; se reemplazó por páginas dedicadas

---

### REP-12 — Motor de alertas de reparto

**Tipo:** Frontend + Backend (opcional)
**Prioridad:** Media-Alta
**Dependencias:** REP-04, REP-08 (para config)

#### Contexto

El gerente necesita alertas proactivas para detectar problemas: pedidos que nadie ha recogido, repartos que se retrasan, repartidores con demasiados pedidos, entregas sin cobrar. Las alertas se calculan client-side con los datos del polling.

#### Qué hacer

**1. Definir las 5 alertas requeridas**

| ID | Alerta | Condición | Severidad | Acción |
|---|---|---|---|---|
| `ready_no_dispatch` | Pedido listo sin salir | Estado `delivery`, sin `departedAt`, tiempo > `alertDelayMinutes` (config) | Warning (amber) | Asignar repartidor |
| `delivery_delayed` | Reparto retrasado | Estado `delivery`, `departedAt` existente, tiempo > `alertDeliveryDelayMinutes` (config) | Error (red) | Contactar repartidor/cliente |
| `driver_overloaded` | Repartidor saturado | Repartidor con pedidos asignados >= `maxOrdersPerDriver` | Warning (amber) | Reasignar pedidos |
| `delivery_failed` | Entrega fallida | Pedido con incidencia tipo "no_entrega", "cliente_ausente", "dirección_incorrecta" | Error (red) | Resolver incidencia |
| `delivered_unpaid` | Entregado sin cobro | Estado `delivered`, `paymentCollected: false`, método "efectivo", > 30 min sin cobrar | Warning (amber) | Registrar cobro |

**2. Panel de alertas (UI)**

Ubicar encima de los KPIs o como banner flotante cuando hay alertas activas:

```
┌─────────────────────────────────────────────────────┐
│ ⚠ 3 alertas activas                         [Ver ▼]│
├─────────────────────────────────────────────────────┤
│ 🟠 Pedido #0038 listo hace 15 min sin repartidor   │
│    → [Asignar ahora]                                │
│ 🔴 Pedido #0035 — reparto retrasado (52 min)        │
│    → [Contactar Pedro M.] [Ver detalle]             │
│ 🟠 Pedro M. tiene 4 pedidos (máx 3)                 │
│    → [Reasignar un pedido]                           │
└─────────────────────────────────────────────────────┘
```

**3. Cálculo de alertas (hook)**

```typescript
function useRepartoAlerts(orders: DeliveryOrder[], drivers: Driver[], config: RepartoConfig): Alert[] {
  return useMemo(() => {
    const alerts: Alert[] = [];
    const now = Date.now();
    
    // ready_no_dispatch
    orders.filter(o => o.status === 'delivery' && !o.departedAt).forEach(o => {
      const waitingMs = now - new Date(o.assemblyCompletedAt || o.updatedAt).getTime();
      if (waitingMs > config.alertDelayMinutes * 60000) {
        alerts.push({ type: 'ready_no_dispatch', severity: 'warning', order: o, minutesWaiting: Math.round(waitingMs / 60000) });
      }
    });
    
    // ... demás alertas
    return alerts;
  }, [orders, drivers, config]);
}
```

**4. Sonido opcional**

Cuando aparece una nueva alerta de severidad `error`, reproducir un sonido breve (configurable en ajustes, desactivado por defecto).

**5. Badge en sidebar**

Mostrar badge con número de alertas activas junto al enlace "Reparto" en la sidebar.

#### Criterios de aceptación
- [ ] 5 tipos de alerta implementados con las condiciones especificadas (hay 4: `ready_no_dispatch`, `delivery_delayed`, `driver_overloaded`, `delivered_unpaid`; falta `delivery_failed`; además `driver_overloaded` depende de `assignedCount` que el endpoint de stats no devuelve)
- [x] Panel de alertas visible en la página de reparto
- [ ] Cada alerta tiene acción directa (asignar, contactar, reasignar, resolver, cobrar) — las alertas son solo texto
- [x] Las alertas se recalculan con cada polling de datos
- [ ] Sonido opcional para alertas de error
- [ ] Badge de alertas en sidebar
- [x] Solo visible para gerente (el repartidor no ve alertas globales)

---

### REP-13 — Gerente como repartidor

**Tipo:** Frontend (React)
**Prioridad:** Media
**Dependencias:** REP-01, REP-05, REP-06

#### Contexto

En negocios pequeños, el gerente puede necesitar hacer entregas. Debe poder "activarse como repartidor" sin perder acceso al panel de gestión.

#### Qué hacer

**1. Botón "Activarme como repartidor" (en vista gerente)**

En la cabecera de la página de reparto (solo para gerente):

```
[🚚 Activarme como repartidor]
```

Al pulsar:
- Si no existe un documento `Driver` con `isManager: true`, crearlo automáticamente con los datos del gerente (nombre, teléfono del perfil).
- Si ya existe, cambiar su estado a `active`.
- Mostrar toggle para alternar entre "Panel de gestión" y "Mis entregas".

**2. Toggle de vista**

Cuando el gerente está activo como repartidor:

```
[📊 Panel de gestión]  [📦 Mis entregas]  |  🟢 Activo como repartidor [Desactivar]
```

- "Panel de gestión" = Vista gerente completa (REP-05).
- "Mis entregas" = Vista trabajador filtrada por su driver ID (REP-06).
- Puede alternar libremente entre ambas.

**3. Al desactivar:**

- Cambiar estado del driver a `offline`.
- Reasignar pedidos pendientes si los tiene (confirmar con modal).
- Volver a vista gerente pura.

**4. Asignarse pedidos**

Desde el panel de gestión, el gerente se ve a sí mismo en la lista de repartidores disponibles y puede asignarse pedidos normalmente.

#### Criterios de aceptación
- [x] Botón "Activarme como repartidor" visible para gerente (botón "Modo repartidor", solo si ya existe su perfil `Driver` con `isManager`)
- [ ] Crea o activa documento `Driver` con `isManager: true` (no lo crea automáticamente; requiere que exista)
- [x] Toggle para alternar entre panel de gestión y mis entregas
- [ ] Al desactivarse, ofrece reasignar pedidos pendientes
- [x] Se ve como repartidor disponible en el modal de asignación
- [x] No pierde acceso a funciones de gerente mientras está activo

---

### REP-14 — Conexiones: Pedidos, Montaje, Caja, CRM, Equipo, Dashboard

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Dependencias:** REP-04, REP-11

#### Contexto

El módulo de reparto no existe aislado. Debe conectarse con los módulos existentes para que la información fluya naturalmente.

#### Qué hacer

**1. Pedidos → Reparto**

- En la tabla de pedidos (`Delivery.tsx` tab "Pedidos"), añadir columna "Repartidor" que muestre el nombre asignado (si existe).
- Al hacer clic en un pedido con estado `delivery`, ofrecer enlace directo "Ver en reparto" que navega a `/saas/vertical/delivery/reparto?pedido={orderId}`.
- Cuando se crea un pedido nuevo y auto-assign está activo, asignar automáticamente al guardar.

**2. Montaje → Reparto**

- En el tab "Montaje" de `Delivery.tsx`, cuando se completa el checklist y se pulsa "Listo para reparto":
  - Si auto-assign está activo: asignar repartidor automáticamente y notificar.
  - Si no: el pedido aparece en reparto como "Listo para salir" / "Sin asignar".
- Añadir indicador visual en montaje: "Repartidor pre-asignado: Pedro M." si ya se asignó antes.

**3. Caja → Reparto**

- En el tab "Caja repartidor" de `Delivery.tsx`, vincular con la entidad `Driver`:
  - Al abrir caja, seleccionar de la lista de repartidores (no input libre).
  - Mostrar solo repartidores activos.
- En la página de reparto, mostrar indicador "Caja abierta" / "Caja cerrada" junto al nombre del repartidor.
- Al cerrar caja, verificar que no hay pedidos de ese repartidor con pago efectivo pendiente.

**4. CRM → Reparto**

- En la ficha de cliente en CRM (`/saas/crm/clientes/:id`), añadir sección "Últimas entregas":
  - Lista de últimos 5 pedidos delivery de ese cliente.
  - Estado, fecha, repartidor, importe.
  - Enlace a detalle del pedido.
- Al crear pedido desde reparto, buscar cliente en CRM por teléfono y mostrar historial si existe.

**5. Equipo → Reparto**

- En la ficha de un miembro del equipo que es repartidor, mostrar:
  - Entregas del día/semana/mes.
  - Tiempo medio de entrega.
  - Enlace al perfil de repartidor.
- Al crear un repartidor (REP-01), permitir seleccionar miembro del equipo existente para vincular con `teamMemberId`.

**6. Dashboard → Reparto**

- En el `Dashboard.tsx`, añadir widget "Reparto en vivo" (solo si módulo activo):
  - Mini-mapa o lista con pedidos en ruta.
  - KPIs: en ruta ahora, media de entrega hoy, entregas totales hoy.
  - Enlace "Ver todo" → `/saas/vertical/delivery/reparto`.

#### Criterios de aceptación
- [ ] Columna "Repartidor" visible en tabla de pedidos (no encontrada en `DeliveryOrders.tsx`)
- [ ] Enlace "Ver en reparto" desde detalle de pedido
- [ ] Trigger de auto-asignación al completar montaje (no encontrado en `DeliveryMontaje.tsx`)
- [ ] Caja de repartidor usa lista de entidades `Driver` (no verificado)
- [ ] Sección "Últimas entregas" en ficha CRM del cliente
- [ ] Stats de delivery en ficha de miembro del equipo
- [ ] Widget "Reparto en vivo" en Dashboard
- [ ] Todos los enlaces bidireccionales funcionales (solo hay enlaces rápidos desde Reparto hacia otros módulos)

---

### REP-15 — Módulo opcional: Feature flag + activación

**Tipo:** Backend + Frontend
**Prioridad:** Alta (implementar pronto, antes de la UI)
**Dependencias:** Ninguna

#### Contexto

El reparto propio es un módulo **opcional**. No todos los negocios de tipo delivery necesitan repartidores propios (algunos usan solo plataformas como Glovo/Uber). Necesitamos un feature flag para activar/desactivar el módulo completo.

#### Qué hacer

**1. Añadir campo en configuración del negocio**

En el documento de settings del negocio (gestionado por `settingsController.js`), añadir:

```typescript
deliverySettings: {
  ownDeliveryEnabled: boolean;     // true = módulo reparto propio activo
  ownDeliveryActivatedAt?: string; // fecha de activación
}
```

**2. UI de activación**

En la página de configuración del negocio o dentro de la propia página de reparto (primera visita):

```
┌─────────────────────────────────────────────────────┐
│  🚚 Reparto propio                                  │
│                                                     │
│  Gestiona tus entregas con repartidores propios.    │
│  Asigna pedidos, controla rutas y cobra al instante.│
│                                                     │
│  ✓ Asignación manual y automática de repartidores   │
│  ✓ Control de entregas en tiempo real               │
│  ✓ Alertas de retrasos y problemas                  │
│  ✓ Contacto directo con el cliente                  │
│  ✓ Integración con caja y CRM                       │
│                                                     │
│  [Activar reparto propio]                           │
└─────────────────────────────────────────────────────┘
```

**3. Condiciones de visibilidad**

| Elemento | Visible si |
|---|---|
| Enlace "Reparto" en sidebar | `ownDeliveryEnabled: true` Y `businessType` incluye delivery |
| Página `/saas/vertical/delivery/reparto` | `ownDeliveryEnabled: true` |
| Columna "Repartidor" en tabla de pedidos | `ownDeliveryEnabled: true` |
| Widget de reparto en Dashboard | `ownDeliveryEnabled: true` |
| Tab "Caja repartidor" en `Delivery.tsx` | Siempre visible (ya existía antes) |
| Tab "Reparto" en `Delivery.tsx` | Siempre visible (funcionalidad básica existente) |

**4. Desactivación**

Al desactivar el módulo:
- Ocultar enlace en sidebar y widget en dashboard.
- Los datos NO se borran (repartidores, config).
- El tab "Reparto" en `Delivery.tsx` sigue funcionando de forma básica.
- Mostrar aviso: "Módulo desactivado — tus datos se conservan".

#### Criterios de aceptación
- [x] Campo `ownDeliveryEnabled` en settings del negocio (existe en `reparto_config`, no en settings; default `false`)
- [ ] Pantalla de activación atractiva con beneficios listados
- [ ] Sidebar oculta enlace si módulo desactivado (no hay enlace de Reparto en sidebar; el flag no gatea nada en UI)
- [ ] Página muestra pantalla de activación si no está activo
- [ ] Al desactivar no se borran datos (no verificable: no hay UI de activación/desactivación)
- [ ] Retrocompatible: negocios existentes sin el campo ven el módulo desactivado por defecto (el flag no se consulta en frontend)

---

## Resumen de dependencias

```
REP-15 (Feature flag) ─────────────────────────────────────────────┐
                                                                    │
REP-01 (Modelo Driver) ──→ REP-02 (Backend API) ──→ REP-03 (API Client)
                                                          │
                                               ┌──────────┼──────────┐
                                               ▼          ▼          ▼
                                          REP-04 (Página base)       │
                                               │                     │
                                    ┌──────────┼──────────┐          │
                                    ▼          ▼          ▼          │
                               REP-05     REP-06     REP-10         │
                              (Gerente)  (Worker)   (Contacto)      │
                                    │          │                     │
                                    ▼          ▼                     │
                               REP-07     REP-11                    │
                             (Asign.     (Estados                   │
                              manual)    + tiempos)                 │
                                    │                               │
                                    ▼                               │
                               REP-08 ──→ REP-12                   │
                             (Asign.     (Alertas)                  │
                              auto)                                 │
                                                                    │
                               REP-09 (Filtros) ← REP-05           │
                               REP-13 (Gerente como repartidor)    │
                               REP-14 (Conexiones) ←───────────────┘
```

## Orden de implementación recomendado

| Fase | Tickets | Descripción |
|---|---|---|
| **Fase 0** | REP-15 | Feature flag (permite ir activando gradualmente) |
| **Fase 1** | REP-01 → REP-02 → REP-03 | Modelo de datos + API + Client (cimientos) |
| **Fase 2** | REP-04, REP-10, REP-11 | Página base + contacto + flujo de estados |
| **Fase 3** | REP-05, REP-06 | Vistas gerente y trabajador |
| **Fase 4** | REP-07, REP-09 | Asignación manual + filtros |
| **Fase 5** | REP-08, REP-12 | Asignación auto + alertas |
| **Fase 6** | REP-13, REP-14 | Gerente como repartidor + conexiones entre módulos |

---

## Notas de diseño

### Paleta de colores del módulo Reparto

| Elemento | Color light | Color dark |
|---|---|---|
| Acento principal (reparto) | `cyan-600` | `cyan-400` |
| "Listo para salir" | `amber-100/700` | `amber-900/400` |
| "En ruta" | `cyan-100/700` con pulso | `cyan-900/400` con pulso |
| "Entregado" | `green-100/700` | `green-900/400` |
| Alerta warning | `amber-100/700` | `amber-900/400` |
| Alerta error | `red-100/700` | `red-900/400` |
| Repartidor activo | `green-500` | `green-400` |
| Repartidor offline | `gray-400` | `gray-600` |
| Repartidor saturado | `orange-500` | `orange-400` |

### Principios UX

1. **Mobile-first para repartidor:** El repartidor usa el móvil con una mano mientras conduce. Botones grandes, info crítica arriba.
2. **Desktop-first para gerente:** El gerente usa un ordenador o tablet en el local. Densidad de información, dos columnas, filtros visibles.
3. **Tiempo real sin agobiar:** Polling cada 30s, no WebSocket (simplifica). Alertas visuales, sonido solo si se activa.
4. **Retrocompatible:** El tab "Reparto" existente en `Delivery.tsx` sigue funcionando para negocios que no activen el módulo completo.
5. **Progressive disclosure:** No mostrar todo de golpe. Configuración avanzada (zonas, auto-asignación) se desbloquea gradualmente.
