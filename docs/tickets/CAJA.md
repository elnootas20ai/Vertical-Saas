# CAJA — Plan de Tickets

**Página:** `/saas/vertical/delivery/caja`
**Objetivo:** Controlar efectivo y cobros reales de cada TPV y punto de venta.
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Sesión de caja TPV (`tpv_register_session`) | Completo | `couchdb.js` — `buildTpvRegisterSessionDocument`, `sanitizeTpvRegisterSession`, `listTpvRegisterSessionsByUser` |
| Apertura de caja con conteo de billetes y monedas | Completo | `TpvRegisterGate.tsx` — `OpeningScreen` con `CashCountGrid` (15 denominaciones EUR) |
| Cierre de caja con conteo real y diferencia | Completo | `TpvRegisterGate.tsx` — `ClosingScreen` con cálculo de esperado vs contado |
| Barra de estado de caja abierta | Completo | `TpvRegisterGate.tsx` — `RegisterStatusBar` (PDV, terminal, trabajador, nº ops, efectivo esperado) |
| Registro de transacciones en caja | Completo | `TpvRegisterGate.tsx` — `addTransaction()` vía contexto React |
| Métodos de pago: efectivo, tarjeta, bizum, online | Completo | `deliveryApi.ts` — `TpvRegisterTransaction.paymentMethod` |
| Tipos de transacción: sale, return, cash_in, cash_out, expense | Completo | `deliveryApi.ts` — `TpvRegisterTransaction.type` |
| Resumen por método de pago al cierre | Completo | `TpvRegisterGate.tsx` — `buildSummary()` calcula `salesByMethod` |
| Arqueos intermedios (modelo de datos) | Parcial | `deliveryApi.ts` — `TpvCashCount` con denominaciones, esperado, contado, diferencia — **sin UI** |
| Puntos de venta (PDV) con terminales | Completo | `deliveryApi.ts` — `PointOfSale` con `terminals: TerminalConfig[]`, CRUD completo |
| Datáfono por terminal | Completo | `deliveryApi.ts` — `TerminalConfig.datafonName`, se asigna al abrir caja |
| Impresora por terminal | Completo | `deliveryApi.ts` — `TerminalConfig.printerName` |
| Sesión de caja repartidor (`driver_cash_session`) | Completo | `deliveryApi.ts` — `DriverCashSession` con flotante, transacciones, cierre |
| UI de caja repartidor (pestaña "Caja" en Delivery) | Completo | `Delivery.tsx` — `DriverCashSessionCard`, apertura/cierre, flotante |
| CRUD de TPV sessions (API) | Completo | `deliveryRouter.js` — `GET/POST /tpv-sessions/:userId`, `PUT/DELETE /tpv-sessions/:userId/:sessionId` |
| CRUD de PDV (API) | Completo | `deliveryRouter.js` — `GET/POST /points-of-sale/:userId`, `PUT/DELETE` |
| CRUD driver sessions (API) | Completo | `deliveryRouter.js` — `GET/POST /driver-sessions/:userId`, `PUT/DELETE` |
| Contexto React para caja activa | Completo | `TpvRegisterGate.tsx` — `TpvRegisterContext` con `session`, `addTransaction`, `requestClose`, `expectedCash` |
| Cálculo de efectivo esperado | Completo | `TpvRegisterGate.tsx` — `calcExpectedCash()` (apertura + ventas − devoluciones + entradas − salidas) |
| TPV multi-vertical (worker pages) | Completo | `WorkerTpv*.tsx` — 18+ verticales con `TpvRegisterGate` integrado |

### Lo que FALTA

| Funcionalidad | Estado |
|---|---|
| Página de gestión de caja (`/saas/vertical/delivery/caja`) | No existe — no hay ruta registrada ni componente |
| Histórico de aperturas y cierres | No existe como vista — los datos están en CouchDB pero no hay UI de consulta |
| Arqueos intermedios (UI) | No existe — el modelo `TpvCashCount` está definido pero no hay interfaz para realizar arqueos |
| Vista gerente de todas las cajas | No existe — cada trabajador solo ve su propia sesión |
| Validación de cierre por gerente | No existe — el cierre lo hace el mismo trabajador sin aprobación |
| Registro de incidencias en caja | No existe — solo hay `closingNotes` como texto libre |
| Separación automática por canal de venta | Parcial — el `channel` está en `DeliveryOrder` pero no se cruza con la sesión de caja |
| Impacto automático de pedido cobrado en caja | No implementado — los pedidos y la caja son entidades desconectadas |
| Descuadre automático al cerrar | Parcial — se calcula la diferencia pero no se genera alerta ni registro de descuadre |
| Alerta: caja sin abrir | No implementado |
| Alerta: caja sin cerrar | No implementado |
| Alerta: descuadre elevado | No implementado |
| Alerta: devolución elevada | No implementado |
| Alerta: pedido entregado sin cobro | No implementado |
| Conexión Caja → Finanzas (movimientos financieros) | No implementado |
| Conexión Caja → Dashboard (KPIs de caja) | No implementado |
| Conexión Caja → Pedidos (cobro impacta en caja) | No implementado |
| Conexión Caja → Reparto (caja del repartidor unificada) | Parcial — `driver_cash_session` existe pero separada de `tpv_register_session` |
| Permisos granulares por perfil (gerente vs trabajador) | Parcial — el `TpvRegisterGate` no distingue roles |
| Soporte para múltiples PDV en vista gerente | No implementado |
| Exportación de datos de caja | No implementado |

---

## Tickets

---

### CAJA-01 — Modelo de datos: Ampliar sesión de caja TPV

**Tipo:** Backend + API Client
**Prioridad:** Alta
**Dependencias:** Ninguna

#### Contexto
La entidad `tpv_register_session` ya existe y funciona para el flujo básico de apertura/cierre, pero le faltan campos necesarios para: validación por gerente, incidencias, separación por canal, y conexión con pedidos. Además, el tipo de transacción necesita soportar más métodos de pago.

#### Qué hacer

**1. Ampliar `TpvRegisterTransaction` en `deliveryApi.ts`**

```typescript
export interface TpvRegisterTransaction {
  id: string;
  type: 'sale' | 'return' | 'cash_in' | 'cash_out' | 'expense' | 'tip' | 'correction';
  paymentMethod: 'efectivo' | 'tarjeta' | 'bizum' | 'online' | 'otro';
  amount: number;
  description: string;
  orderId?: string;
  orderNumber?: string;
  channel?: string;
  date: string;
  registeredBy?: string;
  linkedDeliveryOrderId?: string;
  refundReason?: string;
  correctionRef?: string;
}
```

**2. Ampliar `TpvRegisterSession` en `deliveryApi.ts`**

Añadir campos al tipo existente:

```typescript
export interface TpvRegisterSession {
  // ... campos existentes (mantener todos) ...

  closingValidatedBy?: string;
  closingValidatedAt?: string;
  closingValidationStatus?: 'pending' | 'validated' | 'rejected';
  closingValidationNotes?: string;

  incidents: TpvIncident[];

  salesByChannel?: Record<string, number>;

  linkedOrderIds?: string[];
}
```

**3. Definir `TpvIncident` en `deliveryApi.ts`**

```typescript
export type IncidentType =
  | 'cash_discrepancy'
  | 'card_issue'
  | 'refund'
  | 'void_transaction'
  | 'unauthorized_access'
  | 'system_error'
  | 'other';

export type IncidentSeverity = 'low' | 'medium' | 'high';

export interface TpvIncident {
  id: string;
  date: string;
  type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  reportedBy: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
  amount?: number;
  transactionId?: string;
}
```

**4. Ampliar `TpvRegisterSummary` en `deliveryApi.ts`**

```typescript
export interface TpvRegisterSummary {
  totalSales: number;
  salesByMethod: {
    efectivo: number;
    tarjeta: number;
    bizum: number;
    online: number;
    otro: number;
  };
  salesByChannel: Record<string, number>;
  totalReturns: number;
  returnCount: number;
  totalCashIn: number;
  totalCashOut: number;
  totalTips: number;
  totalTransactions: number;
  averageTicket: number;
  incidentCount: number;
}
```

**5. Actualizar `buildTpvRegisterSessionDocument` y `sanitizeTpvRegisterSession` en `couchdb.js`**

Añadir los nuevos campos con valores por defecto (`incidents: []`, `closingValidationStatus: 'pending'`, `salesByChannel: {}`, `linkedOrderIds: []`).

#### Criterios de aceptación
- [ ] `TpvRegisterTransaction` soporta `type: 'tip' | 'correction'` y `paymentMethod: 'otro'`
- [ ] `TpvRegisterTransaction` incluye `channel`, `registeredBy`, `linkedDeliveryOrderId`, `refundReason`
- [ ] `TpvRegisterSession` incluye campos de validación de cierre
- [ ] `TpvRegisterSession` incluye array de `incidents`
- [ ] `TpvRegisterSummary` incluye `salesByChannel`, `averageTicket`, `incidentCount`
- [ ] Los documentos existentes siguen funcionando (campos nuevos son opcionales con fallback)
- [ ] Backend acepta y persiste los nuevos campos

---

### CAJA-02 — Arqueos intermedios: UI y lógica

**Tipo:** Frontend + Backend
**Prioridad:** Alta
**Dependencias:** CAJA-01

#### Contexto
El modelo `TpvCashCount` ya existe en `deliveryApi.ts` con los campos necesarios (denominaciones, esperado, contado, diferencia), pero no hay ninguna interfaz para que el trabajador realice un arqueo intermedio. Los arqueos son esenciales para detectar descuadres durante el turno sin cerrar la caja.

#### Qué hacer

**1. Botón de arqueo intermedio en `RegisterStatusBar`**

Añadir botón "Arqueo" junto al botón "Cerrar caja" en la barra de estado:

```
┌────────────────────────────────────────────────────────────────────┐
│ ✅ Caja abierta · Juan · Tienda Centro · TPV-01 · 09:00 · 12 ops │
│                                        [🧮 Arqueo] [🔒 Cerrar]    │
└────────────────────────────────────────────────────────────────────┘
```

**2. Modal de arqueo intermedio**

Al pulsar "Arqueo", abrir modal reutilizando `CashCountGrid`:
- Título: "Arqueo intermedio"
- Info: PDV, terminal, hora actual
- Muestra efectivo esperado calculado
- `CashCountGrid` para conteo por denominación
- Resultado: diferencia entre contado y esperado con color (verde=cuadra, rojo=falta, azul=sobrante)
- Campo de notas opcional
- Botón "Registrar arqueo"

**3. Lógica de guardado**

Al confirmar el arqueo:
- Crear un `TpvCashCount` con los datos del conteo
- Añadirlo al array `session.cashCounts[]`
- Llamar a `updateTpvRegisterSessionRequest()` para persistir
- Toast con resultado
- Si la diferencia supera umbral (configurable, ej: ±20€), crear incidencia automática tipo `cash_discrepancy`

**4. Historial de arqueos en la sesión**

Añadir al modal de cierre (`ClosingScreen`) una sección que muestre los arqueos realizados:

```
Arqueos realizados
├── 14:30 — Juan — Contado: 850€ · Esperado: 845.50€ · Dif: +4.50€
└── 18:00 — Juan — Contado: 1.230€ · Esperado: 1.230€ · Dif: 0€ ✓
```

**5. Exponer función de arqueo en el contexto**

Ampliar `TpvRegisterContextType` con `performCashCount`.

#### Criterios de aceptación
- [ ] Botón "Arqueo" visible en la barra de estado cuando la caja está abierta
- [ ] Modal de arqueo con conteo por denominación (reutiliza `CashCountGrid`)
- [ ] Diferencia entre contado y esperado con color
- [ ] El arqueo se guarda en `session.cashCounts[]` y se persiste
- [ ] Si la diferencia supera umbral, se crea incidencia automática
- [ ] Historial de arqueos visible en la pantalla de cierre
- [ ] Función `performCashCount` expuesta en el contexto

---

### CAJA-03 — Automatización: Pedido cobrado impacta en caja

**Tipo:** Lógica de negocio (Frontend + Backend)
**Prioridad:** Crítica
**Dependencias:** CAJA-01

#### Contexto
Cuando un pedido de delivery se cobra (estado `delivered`), NO se registra automáticamente como transacción en la sesión de caja TPV. Son mundos desconectados. Esto causa descuadres y trabajo duplicado.

#### Qué hacer

**1. Hook al completar un pedido de delivery**

```
Al marcar pedido como entregado/cobrado:
  1. Leer la sesión de caja activa del usuario/terminal
  2. Si existe sesión abierta:
     - Crear TpvRegisterTransaction automática:
       type: 'sale'
       paymentMethod: método de pago del pedido
       amount: totalAmount del pedido
       description: "Pedido #{orderNumber} — {customerName}"
       orderId: delivery_order._id
       orderNumber: delivery_order.orderNumber
       channel: delivery_order.channel
       linkedDeliveryOrderId: delivery_order._id
     - Añadir al array de transactions de la sesión
     - Añadir orderId al array linkedOrderIds
  3. Si NO existe sesión abierta:
     - Generar alerta "Pedido cobrado sin caja abierta" (CAJA-07)
```

**2. Hook al registrar una devolución**

Misma lógica con `type: 'return'`, `refundReason` y referencia al pedido original.

**3. Separación automática por canal**

Al guardar la sesión tras añadir transacción, recalcular `salesByChannel` agrupando transacciones `sale` por su campo `channel`.

**4. Idempotencia**

Antes de crear la transacción automática, verificar que no exista ya una con el mismo `linkedDeliveryOrderId` y `type`.

**5. Configuración opt-in**

```typescript
cashRegisterConfig: {
  autoRegisterDeliveryOrders: boolean;   // default: true
  autoRegisterWebOrders: boolean;        // default: true
  autoRegisterReturns: boolean;          // default: true
  discrepancyThreshold: number;          // default: 20
}
```

#### Criterios de aceptación
- [ ] Al cobrar un delivery_order, se crea transacción automática en la caja abierta
- [ ] La transacción incluye `channel`, `linkedDeliveryOrderId`, `orderNumber`
- [ ] Al registrar devolución, se crea transacción tipo `return` en la caja
- [ ] `salesByChannel` se actualiza automáticamente
- [ ] No se crean transacciones duplicadas (idempotencia)
- [ ] Si no hay caja abierta al cobrar, se genera alerta
- [ ] Configuración activable/desactivable en Settings

---

### CAJA-04 — Vista gerente: Panel de control de todas las cajas

**Tipo:** Frontend
**Prioridad:** Crítica
**Dependencias:** CAJA-01, CAJA-02

#### Contexto
No existe una vista para que el gerente vea el estado de todas las cajas. Cada trabajador opera su caja a través del `TpvRegisterGate`, pero no hay supervisión multi-caja. La página `/saas/vertical/delivery/caja` es la vista gerente.

#### Qué hacer

**1. Crear `src/app/pages/saas/CajaPage.tsx`**

Página con pestañas: Estado actual, Historial, Incidencias, Configuración.

**2. KPIs superiores**

| KPI | Cálculo |
|---|---|
| Cajas abiertas | Count de sesiones `status: 'open'` / total terminales activos |
| Ventas hoy | Suma de `totalSales` de todas las sesiones del día |
| Efectivo en caja | Suma de `expectedCash` de todas las sesiones abiertas |
| Tarjeta hoy | Suma de `salesByMethod.tarjeta` de todas las sesiones del día |
| Descuadre acumulado | Suma de `difference` de sesiones cerradas hoy |

Los KPIs incluyen también las sesiones de caja de repartidor (`driver_cash_session`).

**3. Pestaña "Estado actual" (principal)**

Cards en tiempo real de cada caja:
- Estado visual: 🟢 abierta, 🔴 sin abrir, 🟡 repartidor, ⚠ con descuadre
- PDV y terminal asignados
- Trabajador y hora de apertura
- Contadores: nº operaciones, ventas totales
- Desglose por método de pago (badges de color)
- Último arqueo y diferencia
- Botones: "Ver detalle", "Forzar arqueo"

**4. Panel de detalle expandido**

Al click en "Ver detalle":
- Transacciones recientes (últimas 10)
- Resumen acumulado con barras de proporción por método
- Arqueos realizados
- Incidencias
- Botones: "Añadir incidencia", "Solicitar arqueo"

**5. Filtros**

Por PDV, por terminal, por trabajador, por estado (abierta / cerrada / sin abrir).

**6. Registrar ruta y sidebar**

| Archivo | Cambio |
|---|---|
| `routes.tsx` | Añadir `{ path: 'vertical/delivery/caja', Component: CajaPage }` |
| `Sidebar.tsx` | Añadir item "Caja" en el grupo delivery con icono `Banknote`, ruta `/saas/vertical/delivery/caja` |

#### Criterios de aceptación
- [ ] Página accesible en `/saas/vertical/delivery/caja`
- [ ] Vista de cards de todas las cajas abiertas con estado visual
- [ ] Incluye cajas TPV y cajas de repartidor unificadas
- [ ] KPIs agregados
- [ ] Panel de detalle expandido con transacciones, resumen y arqueos
- [ ] Filtros por PDV, terminal, trabajador y estado
- [ ] Entrada en sidebar grupo delivery
- [ ] Responsive + dark mode
- [ ] Skeleton loaders
- [ ] Solo visible para perfiles con rol de gerente/admin

---

### CAJA-05 — Validación de cierre por gerente

**Tipo:** Frontend + Backend
**Prioridad:** Alta
**Dependencias:** CAJA-01, CAJA-04

#### Contexto
El cierre de caja lo realiza el mismo trabajador sin supervisión. Muchos negocios necesitan que un gerente valide el cierre, revise las diferencias y apruebe o rechace.

#### Qué hacer

**1. Flujo de cierre con validación (configurable)**

```
Trabajador cierra la caja (conteo + notas)
    ▼
¿Validación de gerente activa? (Setting)
   SÍ → Estado: 'pending' → Gerente revisa → ✅ Validar / ❌ Rechazar
   NO → Estado: 'validated' (cierre directo como hasta ahora)
```

**2. Configuración**

```typescript
cashRegisterConfig: {
  requireManagerValidation: boolean;  // default: false
  autoValidateIfZeroDiff: boolean;    // default: true
  maxDiffAutoValidate: number;        // default: 5
}
```

Si `autoValidateIfZeroDiff` y la diferencia absoluta ≤ `maxDiffAutoValidate`, se autovalidará.

**3. Vista de validaciones pendientes en `CajaPage.tsx`**

Sección superior o badge de alerta:

```
⚠ 2 cierres pendientes de validación
├── TPV-01 · Juan · Cierre 21:30 · Dif: -12.50€  [Revisar]
└── TPV-02 · Ana  · Cierre 21:00 · Dif: +2.00€   [Revisar]
```

**4. Modal de validación**

Al hacer click en "Revisar":
- Resumen completo: apertura, cierre, ventas, diferencia, arqueos, incidencias
- Notas del trabajador
- Campo de notas del gerente
- Botones "Validar" y "Rechazar"

**5. Notificación al trabajador si se rechaza**

Toast in-app + push. El motivo del rechazo queda visible para el trabajador.

#### Criterios de aceptación
- [ ] Configuración `requireManagerValidation` disponible en Settings
- [ ] Al cerrar caja con validación activa, el estado queda `pending`
- [ ] Cierres pendientes visibles en el panel gerente con badge
- [ ] Modal de revisión con toda la info
- [ ] Botones "Validar" y "Rechazar" funcionales
- [ ] Autovalidación si diferencia dentro del umbral
- [ ] Al rechazar, se notifica al trabajador
- [ ] Registro completo de la validación en la sesión

---

### CAJA-06 — Gestión de incidencias en caja

**Tipo:** Frontend + Backend
**Prioridad:** Alta
**Dependencias:** CAJA-01, CAJA-04

#### Contexto
Solo existe `closingNotes` como texto libre. No hay registro formal de incidencias tipificadas.

#### Qué hacer

**1. Botón "⚠ Incidencia" en la `RegisterStatusBar`**

Junto a los botones "Arqueo" y "Cerrar caja".

**2. Modal de creación de incidencia**

- Tipo: `cash_discrepancy | card_issue | refund | void_transaction | system_error | other`
- Gravedad: `low | medium | high`
- Importe afectado (si aplica)
- Descripción (obligatoria)
- Transacción vinculada (dropdown opcional)

**3. Guardar en `session.incidents[]`**

Al registrar: crear `TpvIncident`, añadir al array, persistir.

**4. Pestaña "Incidencias" en `CajaPage.tsx`**

Tabla para el gerente con todas las incidencias:
- Columnas: Fecha, PDV/Terminal, Trabajador, Tipo (badge), Gravedad (badge), Descripción, Importe, Estado, Acciones
- Filtros: PDV, tipo, gravedad, estado (abiertas/resueltas), rango de fechas

**5. Resolver incidencia**

El gerente puede marcar como resuelta con notas de resolución.

**6. Badge de incidencias en la card de caja**

Si una caja tiene incidencias abiertas, mostrar badge rojo con count.

#### Criterios de aceptación
- [ ] Botón "Incidencia" en la barra de estado de caja abierta
- [ ] Modal de creación con tipo, gravedad, importe, descripción, transacción vinculada
- [ ] Incidencias se guardan en `session.incidents[]`
- [ ] Pestaña "Incidencias" en la página de gerente con tabla filtrable
- [ ] El gerente puede resolver incidencias con notas
- [ ] Badge de incidencias abiertas en la card de caja
- [ ] Incidencias de severidad `high` generan alerta inmediata

---

### CAJA-07 — Sistema de alertas de caja

**Tipo:** Backend + Frontend
**Prioridad:** Alta
**Dependencias:** CAJA-01, CAJA-03

#### Contexto
No existe sistema de alertas proactivas para la operativa de caja. Se necesitan 5 tipos de alerta.

#### Qué hacer

**1. Alerta: Caja sin abrir**

```javascript
async function checkCashRegisterNotOpened(userId, terminals, sessions, config) {
  // Si ha pasado la hora de inicio del negocio (businessStartHour, default: 9)
  // y un terminal activo no tiene sesión abierta ni cerrada hoy:
  // → emitAlert level: 'warning', category: 'cash_register_not_opened'
  // → dedupKey: `register-not-opened-${terminal.id}-${todayStr}`
}
```

**2. Alerta: Caja sin cerrar**

```javascript
async function checkCashRegisterNotClosed(userId, sessions, config) {
  // Si una sesión lleva abierta más de maxOpenHours (default: 14)
  // o ha pasado registerCloseDeadlineHour (default: 23):
  // → emitAlert level: 'warning' o 'alert', category: 'cash_register_not_closed'
}
```

**3. Alerta: Descuadre**

```javascript
async function checkCashDiscrepancy(userId, sessions, config) {
  // Sesiones cerradas en últimas 24h con |difference| > discrepancyThreshold (default: 20€):
  // → emitAlert level: 'warning' o 'alert', category: 'cash_discrepancy'
}
```

**4. Alerta: Devolución elevada**

```javascript
async function checkHighRefund(userId, sessions, config) {
  // Transacciones tipo 'return' en sesiones abiertas con amount > highRefundThreshold (default: 50€):
  // → emitAlert level: 'warning' o 'alert', category: 'high_refund'
}
```

**5. Alerta: Pedido entregado sin cobro**

```javascript
async function checkDeliveredWithoutPayment(userId, orders, sessions, config) {
  // Pedidos con status 'delivered' hoy que no tienen transacción vinculada en ninguna sesión:
  // → emitAlert level: 'warning', category: 'delivered_without_payment'
}
```

**6. Configuración**

Ampliar `getAlertConfig()`:

```javascript
registerNotOpenedEnabled: cfg.registerNotOpenedEnabled !== false,
registerNotClosedEnabled: cfg.registerNotClosedEnabled !== false,
registerCloseDeadlineHour: Number(cfg.registerCloseDeadlineHour || 23),
maxOpenHours: Number(cfg.maxOpenHours || 14),
businessStartHour: Number(cfg.businessStartHour || 9),
discrepancyAlertEnabled: cfg.discrepancyAlertEnabled !== false,
discrepancyThreshold: Number(cfg.discrepancyThreshold || 20),
highRefundAlertEnabled: cfg.highRefundAlertEnabled !== false,
highRefundThreshold: Number(cfg.highRefundThreshold || 50),
deliveredWithoutPaymentEnabled: cfg.deliveredWithoutPaymentEnabled !== false,
```

**7. Integrar en ciclo de alertas**

Añadir carga de datos de `tpv_register_session` y `point_of_sale` al `runAlertsForUser()` y ejecutar las 5 funciones.

**8. Banner de alertas en `CajaPage.tsx`**

Las alertas se muestran en el banner de la página: `alert` en rojo, `warning` en amber.

#### Criterios de aceptación
- [ ] `checkCashRegisterNotOpened()` detecta terminales sin caja abierta en horario comercial
- [ ] `checkCashRegisterNotClosed()` detecta cajas abiertas demasiado tiempo
- [ ] `checkCashDiscrepancy()` detecta descuadres que superan el umbral
- [ ] `checkHighRefund()` detecta devoluciones superiores al umbral
- [ ] `checkDeliveredWithoutPayment()` detecta pedidos entregados sin cobro
- [ ] Las 5 reglas integradas en el ciclo del `alertEngine`
- [ ] Configuración de activación/desactivación y umbrales por regla
- [ ] Notificaciones in-app + SSE + Web Push como las alertas existentes
- [ ] Banner visible en la página de caja

---

### CAJA-08 — Historial de aperturas y cierres

**Tipo:** Frontend
**Prioridad:** Alta
**Dependencias:** CAJA-04

#### Contexto
Los datos de todas las sesiones se guardan en CouchDB pero no hay interfaz de consulta del historial.

#### Qué hacer

**1. Pestaña "Historial" en `CajaPage.tsx`**

Tabla con todas las sesiones cerradas:

| Columna | Contenido |
|---|---|
| Fecha | Día de la sesión |
| PDV | Punto de venta |
| Terminal | Nombre del terminal |
| Trabajador | Quien operó la caja |
| Apertura | Hora de apertura |
| Cierre | Hora de cierre |
| Ventas | Total de ventas |
| Efectivo | Cobros en efectivo |
| Tarjeta | Cobros en tarjeta |
| Bizum | Cobros en Bizum |
| Diferencia | Contado − esperado (color rojo si negativo, verde si 0, azul si positivo) |
| Estado | Validado ✅ / Pendiente ⚠ / Rechazado ❌ |

Filtros: Fecha, PDV, Terminal, Trabajador, Estado.

**2. Detalle de sesión histórica**

Al click en una fila, abrir modal/drawer con todo:
- Info apertura: fecha, hora, trabajador, fondo, conteo
- Resumen de operaciones: ventas, desglose método, devoluciones, entradas/salidas
- Lista de transacciones completa
- Arqueos realizados con diferencias
- Info cierre: hora, conteo, diferencia
- Validación: quién validó, cuándo, notas
- Incidencias: lista con estado

**3. KPIs de resumen en la pestaña**

| KPI | Cálculo |
|---|---|
| Sesiones en el período | Count |
| Ventas totales | Suma totalSales |
| Descuadre total | Suma de differences |
| Descuadre medio | Media de abs(difference) |
| Sesiones con descuadre | Count donde abs(difference) > umbral |
| Incidencias | Count total |

**4. Gráficos**

- Barras: ventas por día (últimos 30 días)
- Línea: diferencias de cierre por día
- Circular: distribución por método de pago

**5. Exportación**

CSV y Excel (reutilizar lógica de `accountingExport.ts`).

#### Criterios de aceptación
- [ ] Tabla de historial con filtros completos
- [ ] Detalle de sesión con toda la información
- [ ] KPIs de resumen del período filtrado
- [ ] Gráficos de evolución y distribución
- [ ] Exportación CSV y Excel funcional
- [ ] Color diferenciado para sesiones con/sin descuadre
- [ ] Paginación o scroll infinito
- [ ] Responsive + dark mode

---

### CAJA-09 — Permisos: Perfil gerente vs trabajador

**Tipo:** Frontend + Backend
**Prioridad:** Alta
**Dependencias:** CAJA-04, CAJA-05

#### Contexto
El `TpvRegisterGate` no distingue roles. Se necesita un modelo de permisos claro.

#### Qué hacer

**1. Definir permisos de caja**

Ampliar `TEAM_PERMISSION_KEYS` en `couchdb.js`:

```javascript
'cash_register',
'cash_register_manage',
'cash_register_operate',
```

**2. Matriz de acciones por perfil**

| Acción | Gerente (`cash_register_manage`) | Trabajador (`cash_register_operate`) |
|---|---|---|
| Abrir/cerrar caja propia | ✅ | ✅ |
| Registrar transacción | ✅ | ✅ |
| Realizar arqueo | ✅ | ✅ |
| Registrar incidencia | ✅ | ✅ |
| Ver página `/saas/vertical/delivery/caja` | ✅ | ❌ (redirige a su TPV) |
| Ver todas las cajas | ✅ | ❌ |
| Ver historial completo | ✅ | ❌ (solo sus sesiones) |
| Validar cierre de otro | ✅ | ❌ |
| Resolver incidencias | ✅ | ❌ |
| Configurar alertas | ✅ | ❌ |
| Exportar datos | ✅ | ❌ |
| Registrar devoluciones | ✅ | Configurable por terminal |
| Hacer cash_out (retiro) | ✅ | Configurable por terminal |

**3. Asignación de caja a trabajador**

Ampliar `TerminalConfig` en `deliveryApi.ts`:

```typescript
export interface TerminalConfig {
  // ... campos existentes ...
  assignedWorkerId?: string;
  assignedWorkerName?: string;
  allowReturnsByWorker: boolean;
  allowCashOutByWorker: boolean;
  maxCashOutAmount?: number;
}
```

**4. Redirección por rol**

En `CajaPage.tsx`:
- `cash_register_manage` → página completa
- Solo `cash_register_operate` → redirigir a su WorkerTpv

#### Criterios de aceptación
- [ ] Permisos `cash_register_manage` y `cash_register_operate` definidos
- [ ] La página de gerente solo es accesible con `cash_register_manage`
- [ ] El trabajador solo ve/opera su propia caja
- [ ] Devoluciones y retiros controlados por configuración del terminal
- [ ] Asignación de trabajador a terminal funcional
- [ ] Redirección automática según rol

---

### CAJA-10 — Conexión: Pedidos ↔ Caja

**Tipo:** Frontend
**Prioridad:** Alta
**Dependencias:** CAJA-03

#### Contexto
Los pedidos de delivery y la caja TPV deben estar visualmente conectados de forma bidireccional.

#### Qué hacer

**1. Indicador de cobro en la lista de pedidos**

En `Delivery.tsx`, badge por pedido:
- 🟢 "Cobrado" — tiene transacción vinculada en caja
- 🟡 "Pendiente" — entregado pero sin cobro
- 🔴 "Sin caja" — no hay sesión abierta

**2. En el detalle del pedido**

Badge: "Cobrado en TPV-01 · 13:45 · Tarjeta" con link a la sesión.

**3. En la vista de caja (detalle expandido)**

Click en número de pedido navega al detalle del pedido. Filtro rápido "Solo pedidos".

**4. Resumen de pedidos en el cierre**

```
Pedidos vinculados: 23
  Delivery: 15 (1.200€)
  Mostrador: 6 (450€)
  Web: 2 (180€)
```

#### Criterios de aceptación
- [ ] Badge de estado de cobro visible en la lista de pedidos
- [ ] Detalle del pedido muestra info de cobro en caja
- [ ] Desde la caja se puede navegar al pedido
- [ ] Resumen de pedidos vinculados en la pantalla de cierre
- [ ] Links bidireccionales funcionales

---

### CAJA-11 — Conexión: Caja ↔ Finanzas

**Tipo:** Backend + Frontend
**Prioridad:** Media
**Dependencias:** CAJA-03, FIN-01

#### Contexto
Los datos de caja representan ingresos reales pero no fluyen al módulo de Finanzas. Al cerrar una caja, los cobros deberían generar movimientos financieros automáticos.

#### Qué hacer

**1. Automatización: Cierre de caja genera movimientos financieros**

Al cerrar (y validar) una sesión:

```
Para cada método de pago con importe > 0:
  Crear movimiento tipo 'cobro' en finanzas:
    concept: "Caja {terminalName} — {fecha} — {método}"
    totalAmount: importe del método
    payMethod: método correspondiente
    category: 'ventas_caja'
    reference: session._id
    bankAccountId: según mapeo método → cuenta
    linkedInvoiceId: session._id
    linkedInvoiceType: 'tpv_register_session'
```

**2. Mapeo de métodos de pago a cuentas**

Configuración en Settings:

```typescript
cashRegisterFinanceMapping: {
  efectivo: { bankAccountId: string; category: string };
  tarjeta:  { bankAccountId: string; category: string };
  bizum:    { bankAccountId: string; category: string };
  online:   { bankAccountId: string; category: string };
  otro:     { bankAccountId: string; category: string };
}
```

**3. Widget "Caja hoy" en landing financiera (FIN-03)**

Mini-widget con ventas hoy, desglose por método, link a la página de caja.

**4. Conciliación caja vs extracto bancario**

En `BankReconciliationPage.tsx`, poder vincular extractos con cierres de caja (el importe de tarjeta del cierre debería coincidir con el abono bancario del día siguiente).

#### Criterios de aceptación
- [ ] Al cerrar/validar caja se crean movimientos financieros por método de pago
- [ ] Mapeo configurable de método de pago a cuenta bancaria
- [ ] Widget de caja en la landing financiera
- [ ] No se crean duplicados si el cierre ya tiene movimientos vinculados
- [ ] Los movimientos generados tienen referencia a la sesión de caja

---

### CAJA-12 — Conexión: Caja ↔ Reparto

**Tipo:** Frontend
**Prioridad:** Media
**Dependencias:** CAJA-04

#### Contexto
El repartidor tiene su propia sesión de caja (`driver_cash_session`) independiente de la caja TPV (`tpv_register_session`). Ambas gestionan efectivo pero están desconectadas. El gerente debería ver ambas en el mismo panel.

#### Qué hacer

**1. Unificar vista en `CajaPage.tsx`**

En "Estado actual", mostrar ambos tipos:
- Cajas TPV → cards con icono de tienda
- Cajas de repartidor → cards con icono de moto

**2. KPIs consolidados**

Sumar ambos tipos:
- "Efectivo total" = efectivo TPV + efectivo repartidores
- "Cajas abiertas" = sesiones TPV + sesiones repartidor

**3. Historial unificado**

Filtro adicional: "Tipo: TPV / Repartidor / Todos".

**4. Flujo de liquidación repartidor → caja**

```
Repartidor cierra su caja
  → Entrega: 170€ (50€ flotante + 120€ cobros)
    ▼
Gerente confirma recepción en la caja TPV
  → cash_in de 170€ en TPV-01
  → driver_cash_session se marca como cerrada
  → Diferencia entre esperado y entregado
```

#### Criterios de aceptación
- [ ] Vista unificada de cajas TPV y repartidor en la página de gerente
- [ ] KPIs consolidados
- [ ] Historial unificado con filtro por tipo
- [ ] Flujo de liquidación: repartidor → gerente → caja TPV
- [ ] Diferencias de entrega del repartidor registradas

---

### CAJA-13 — Conexión: Caja ↔ Dashboard

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Dependencias:** CAJA-04

#### Contexto
El Dashboard no muestra ningún KPI de caja.

#### Qué hacer

**1. Widget "Cajas hoy" en Dashboard**

```
┌───────────────────────────────────────┐
│  🏪 Cajas hoy                          │
│                                        │
│  Abiertas:     3/4                    │
│  Ventas hoy:   2.450€                │
│  Efectivo:     845€ (35%)             │
│  Tarjeta:      1.200€ (49%)          │
│  Bizum:        405€ (16%)             │
│                                        │
│  ⚠ 1 caja sin abrir                  │
│  ⚠ Descuadre ayer: -12.50€          │
│                                        │
│  [Ver cajas →]                        │
└───────────────────────────────────────┘
```

**2. KPIs para Dashboard API**

Ampliar endpoint `/api/dashboard/kpis/:userId`:

```javascript
cashRegister: {
  openRegisters: 3,
  totalRegisters: 4,
  salesToday: 2450.00,
  salesByMethod: { efectivo: 845, tarjeta: 1200, bizum: 405, online: 0 },
  totalCashInRegisters: 845.00,
  yesterdayDifference: -12.50,
  alerts: [{ type: 'cash_register_not_opened', terminalName: 'TPV-03' }],
  vsPreviousDay: { salesChange: 12.0 },
},
```

**3. Sparkline de ventas** por caja (últimos 7 días).

**4. Botón** "Ver cajas" → `/saas/vertical/delivery/caja`.

#### Criterios de aceptación
- [ ] Widget "Cajas hoy" visible en Dashboard
- [ ] KPIs: cajas abiertas, ventas, desglose método, efectivo total
- [ ] Alertas de caja visibles dentro del widget
- [ ] Sparkline de tendencia
- [ ] Click navega a la página de caja
- [ ] Responsive + dark mode

---

### CAJA-14 — Pestaña "Configuración" en CajaPage

**Tipo:** Frontend
**Prioridad:** Media
**Dependencias:** CAJA-04, CAJA-05, CAJA-07

#### Contexto
Todas las opciones de configuración de los tickets anteriores necesitan una interfaz.

#### Qué hacer

**1. Secciones de configuración**

**General:**
- Registrar pedidos en caja automáticamente (toggle)
- Registrar devoluciones automáticamente (toggle)
- Requerir validación de gerente al cerrar (toggle)
- Autovalidar si diferencia ≤ X€ (toggle + input numérico)

**Alertas:**
- Caja sin abrir después de las HH:00 (toggle + hora)
- Caja sin cerrar después de las HH:00 (toggle + hora)
- Descuadre superior a X€ (toggle + importe)
- Devolución superior a X€ (toggle + importe)
- Pedido entregado sin cobro (toggle)
- Máximo horas caja abierta (input numérico)

**Permisos por terminal:**
- Por cada terminal: trabajador asignado (dropdown), permitir devoluciones (toggle), permitir retiro (toggle), máximo retiro sin aprobación (input)

**Conexión con Finanzas:**
- Generar movimientos financieros al cerrar (toggle)
- Mapeo método de pago → cuenta bancaria (dropdowns)

**2. Persistencia**

Guardar en `settingsController.js` → `PUT /api/settings/:userId` como `cashRegisterConfig`.

#### Criterios de aceptación
- [ ] Pestaña "Configuración" accesible en la página de caja
- [ ] Secciones: General, Alertas, Permisos por terminal, Conexión con Finanzas
- [ ] Toggles, inputs numéricos y selectors funcionales
- [ ] Guardado en settings del negocio
- [ ] Validaciones en los campos
- [ ] Solo accesible para gerente/admin

---

## Orden de ejecución recomendado

```
Fase 1 — Cimientos (modelo de datos + fundamentos)
├── CAJA-01 Ampliar modelo de datos TpvRegisterSession
└── CAJA-09 Permisos: gerente vs trabajador

Fase 2 — Funcionalidad core de operativa
├── CAJA-02 Arqueos intermedios (UI)
├── CAJA-03 Pedido cobrado impacta en caja
└── CAJA-06 Gestión de incidencias

Fase 3 — Vista gerente
├── CAJA-04 Panel de control de todas las cajas
├── CAJA-05 Validación de cierre por gerente
└── CAJA-08 Historial de aperturas y cierres

Fase 4 — Alertas y configuración
├── CAJA-07 Sistema de alertas de caja
└── CAJA-14 Pestaña de configuración

Fase 5 — Integraciones
├── CAJA-10 Pedidos ↔ Caja
├── CAJA-11 Caja ↔ Finanzas
├── CAJA-12 Caja ↔ Reparto
└── CAJA-13 Caja ↔ Dashboard
```

## Estimación de esfuerzo

| Ticket | Complejidad | Estimación |
|---|---|---|
| CAJA-01 Ampliar modelo de datos | Media | 3-4h |
| CAJA-02 Arqueos intermedios UI | Media | 4-5h |
| CAJA-03 Pedido cobrado → caja | Alta | 5-6h |
| CAJA-04 Panel gerente | Muy Alta | 8-10h |
| CAJA-05 Validación cierre | Alta | 5-6h |
| CAJA-06 Incidencias | Alta | 5-6h |
| CAJA-07 Alertas de caja | Alta | 5-6h |
| CAJA-08 Historial | Alta | 6-8h |
| CAJA-09 Permisos | Media-Alta | 4-5h |
| CAJA-10 Pedidos ↔ Caja | Media | 3-4h |
| CAJA-11 Caja ↔ Finanzas | Alta | 5-6h |
| CAJA-12 Caja ↔ Reparto | Media-Alta | 4-5h |
| CAJA-13 Caja ↔ Dashboard | Media | 3-4h |
| CAJA-14 Configuración | Media | 3-4h |
| **Total** | | **~63-79h** |

---

## Notas técnicas

### Base de datos
Todos los documentos (`tpv_register_session`, `driver_cash_session`, `point_of_sale`) ya viven en la DB de delivery (`getDeliveryDbName()`). Los nuevos campos se añaden a documentos existentes — CouchDB no requiere migraciones.

### Sin migraciones
CouchDB no requiere migraciones de esquema. Los documentos existentes sin los nuevos campos siguen funcionando. Las funciones de lectura manejan `undefined` con valores por defecto.

### Retrocompatibilidad
- Sesiones existentes sin `incidents`, `salesByChannel`, `closingValidationStatus` siguen funcionando
- Los `WorkerTpv*.tsx` (18+ verticales) siguen usando `TpvRegisterGate` sin cambios externos
- Las rutas API existentes (`/api/delivery/tpv-sessions/...`) no cambian
- `TpvRegisterTransaction` amplía opciones pero mantiene las existentes

### Componentes reutilizables
- `CashCountGrid` — Ya existe, se reutiliza en apertura, cierre y arqueos
- `calcExpectedCash()` — Ya funciona para cualquier conjunto de transacciones
- `buildSummary()` — Se amplía manteniendo la firma existente

### Acceso y permisos
- Se amplía `TEAM_PERMISSION_KEYS` con `cash_register`, `cash_register_manage`, `cash_register_operate`
- La lógica de roles actual (`MANAGER_ROLES`) se respeta
- La página de gerente requiere `cash_register_manage`

### Consistencia con alertEngine existente
Las 5 nuevas alertas (CAJA-07) siguen el mismo patrón del `alertEngine` / `alertController.js`:
- Misma función `emitAlert()` con dedup diario
- Mismas notificaciones in-app + SSE + Web Push
- Misma estructura de configuración en `account.alertConfig`

### Precisión numérica
Todos los cálculos monetarios usan `Number.toFixed(2)`. La función `calcDenominationTotal()` ya implementa esto.

### i18n
Labels nuevos en los 4 idiomas existentes (es, en, pt, fr). Tipos de incidencia, estados de validación y labels de alertas deben ser traducibles.
