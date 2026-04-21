# FLOTANTE Y CIERRE DE REPARTIDOR — Plan de Tickets

**Tipo:** Modal / Acción
**Desde:** Reparto, Caja
**Objetivo:** Controlar el dinero en efectivo del repartidor durante su turno de reparto.
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Modelo `driver_cash_session` (CouchDB) | Completo | `couchdb.js` — campos: `driverName`, `status`, `initialFloat`, `transactions[]`, `expectedCash`, `actualCash`, `difference`, `closingNotes` |
| CRUD backend sesiones | Completo | `deliveryController.js` — `listDriverCashSessions`, `createDriverCashSession`, `updateDriverCashSession`, `removeDriverCashSession` |
| Rutas API | Completo | `deliveryRouter.js` — `GET/POST /api/delivery/driver-sessions/:userId`, `PUT/DELETE .../:sessionId` |
| Tipos TypeScript (`DriverCashSession`, `CashTransaction`) | Completo | `deliveryApi.ts` — interfaces con `id`, `type`, `paymentMethod`, `amount`, `orderNumber`, `orderId`, `description`, `date` |
| API client frontend | Completo | `deliveryApi.ts` — `listDriverCashSessionsRequest`, `createDriverCashSessionRequest`, `updateDriverCashSessionRequest`, `deleteDriverCashSessionRequest` |
| Formulario apertura caja (`OpenCashSessionForm`) | Completo | `Delivery.tsx` — nombre repartidor (con sugerencias de drivers conocidos), botones rápidos fondo (20/30/50/100€), importe libre |
| Card de sesión activa (`DriverCashSessionCard`) | Completo | `Delivery.tsx` — KPIs (fondo, ventas, gastos, entregas), desglose por método (efectivo/tarjeta/bizum/online), listado de movimientos, formulario nuevo movimiento (cobro/gasto/ajuste + método pago + importe + pedido + desc.) |
| Cobro rápido por pedido | Completo | `Delivery.tsx` — lista pedidos entregados sin cobrar, botones rápidos por método de pago, vincula `orderId` y `orderNumber` |
| Flujo de cierre (formulario) | Completo | `Delivery.tsx` — muestra fondo + cobros efectivo + gastos + esperado, input efectivo real, cálculo diferencia en vivo, notas de cierre |
| Resumen sesión cerrada (`ClosedSessionSummary`) | Completo | `Delivery.tsx` — expandible, muestra fondo/efectivo cobrado/esperado/real, gastos, notas, historial de movimientos |
| Cálculo de `expectedCash` | Completo | `Delivery.tsx` — `initialFloat + cashIn(efectivo) - cashOut + adjustments` |
| Log de actividad | Completo | `deliveryController.js` — registra apertura (`"Abrió caja repartidor X — Y€"`) y cierre (`"Cerró caja repartidor X — Diferencia: Z€"`) |
| Tab "Caja" en Delivery | Completo | `Delivery.tsx` — tab `driverCash` con badge de sesiones abiertas |

### Lo que FALTA

| Funcionalidad | Estado | Impacto |
|---|---|---|
| **Alertas en `alertEngine.js`** | No existe | No hay alertas de: repartidor sin cerrar, descuadre de flotante, cobro efectivo sin registrar |
| **Justificantes de transacción** | No existe | No se pueden adjuntar fotos/documentos a un movimiento (ej: ticket de gasolina, factura) |
| **Integración con Caja/Finanzas** | No existe | El cierre de un repartidor NO genera movimiento financiero, NO impacta saldo de caja ni cuenta bancaria |
| **Integración con Incidencias** | No existe | Un descuadre significativo NO genera incidencia automática ni se vincula al sistema de incidencias |
| **Validación de gerente** | No existe | No hay flujo de aprobación: el cierre es directo sin que un gerente lo revise ni firme |
| **Modal flotante** | No existe | El flujo actual es una tab completa dentro de Delivery, no un modal invocable desde Reparto o Caja |
| **Automatización cobro desde pedido** | Parcial | Existe cobro rápido manual, pero NO se crea transacción automáticamente al marcar pedido como "entregado + pagado en efectivo" |
| **Vista de trabajador (su propia caja)** | No existe | El repartidor no puede gestionar su propio flotante desde su perfil/vista; solo lo hace el gestor desde Delivery |
| **Eliminación/edición de transacciones** | No existe | Una vez registrado un movimiento, no se puede corregir ni eliminar |
| **Reapertura de sesión** | No existe | Si se cierra por error, no se puede reabrir |
| **Impresión/exportación de cierre** | No existe | No se puede imprimir un resumen ni exportar el cierre |
| **Historial filtrable** | Parcial | Se muestran las últimas 20 sesiones cerradas, pero no hay filtros por fecha, repartidor ni rango |
| **Flotante por defecto configurable** | No existe | El fondo por defecto (50€) está hardcodeado; el gerente no puede configurar un valor por defecto por repartidor |
| **Bloqueo de doble sesión** | No existe | Un mismo repartidor puede tener múltiples sesiones abiertas simultáneamente |

---

## Tickets

---

### FLOT-01 — Modal de flotante: componente reutilizable

**Tipo:** Frontend
**Prioridad:** Crítica
**Dependencias:** Ninguna

#### Contexto
Actualmente el flujo de flotante vive como tab "Caja" dentro de `Delivery.tsx` (~350 líneas). Los requisitos piden que sea un **modal / acción invocable** desde al menos dos sitios: la vista de Reparto y la vista de Caja. Además, los componentes internos (`OpenCashSessionForm`, `DriverCashSessionCard`, `ClosedSessionSummary`) están definidos inline en `Delivery.tsx` y no son reutilizables.

#### Qué hacer

**1. Extraer componentes a archivo dedicado**

Crear `src/app/components/delivery/DriverCashModal.tsx` con los siguientes componentes refactorizados:

| Componente actual (en `Delivery.tsx`) | Nuevo componente | Cambios |
|---|---|---|
| `OpenCashSessionForm` (línea 903) | `DriverFloatOpenForm` | Misma funcionalidad, props limpias, acepta `defaultFloat` configurable |
| `DriverCashSessionCard` (línea 965) | `DriverFloatActiveSession` | Misma funcionalidad + nuevas features (FLOT-02 a FLOT-06) |
| `ClosedSessionSummary` (línea 1216) | `DriverFloatClosedSummary` | Misma funcionalidad + filtros + exportar |
| `renderDriverCashTab()` (línea 1866) | `DriverCashModal` | Modal wrapper que orquesta todo el flujo |

**2. Diseñar el modal**

```
┌─────────────────────────────────────────────────────────────────────┐
│  ✕  CAJA DE REPARTIDORES                           [⚙ Configurar]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─ Banner alertas (si las hay) ──────────────────────────────────┐│
│  │ ⚠ Carlos Pérez lleva abierta la caja desde las 12:30 (8h)    ││
│  │ ⚠ Último cierre de Ana López tuvo descuadre de -15.40€       ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  [+ Abrir caja de repartidor]                                       │
│                                                                     │
│  ── CAJAS ABIERTAS (2) ────────────────────────────────────────── │
│                                                                     │
│  ┌─ Carlos Pérez ───────────────── Efectivo esperado: 187.50€ ──┐│
│  │  KPIs: Fondo 50€ | Ventas 156€ | Gastos 18.50€ | 6 entregas ││
│  │  Desglose: 💵95€  💳45€  📱16€                                ││
│  │                                                                ││
│  │  ⚡ Pedidos sin cobrar (2):                                    ││
│  │    #0047 María García   23.50€   [💵] [💳] [📱]               ││
│  │    #0051 Juan López     18.00€   [💵] [💳] [📱]               ││
│  │                                                                ││
│  │  📋 Movimientos (8):                                           ││
│  │    14:32  ↑ Cobro #0045 — Pedro Ruiz       +34.50€  Efectivo  ││
│  │    14:15  ↓ Gasto — Gasolina               -18.50€  Efectivo  ││
│  │    13:48  ↑ Cobro #0042 — Ana Martín       +28.00€  Tarjeta   ││
│  │    ...                                                         ││
│  │                                                                ││
│  │  [+ Añadir movimiento]          [🔒 Cerrar caja]              ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  ── HISTORIAL ──────────────────── [Filtrar] [Exportar CSV] ───── │
│                                                                     │
│  ┌─ Ana López · 14 abr · 08:00→15:30 ── Ventas 230€ · Dif: 0€ ─┐│
│  │  (click para expandir)                                         ││
│  └────────────────────────────────────────────────────────────────┘│
│  ┌─ Carlos P. · 13 abr · 09:00→17:15 ── Ventas 185€ · Dif:-2€ ─┐│
│  └────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**3. Puntos de invocación del modal**

| Desde | Cómo se abre | Contexto |
|---|---|---|
| Tab "Reparto" (`Delivery.tsx`) | Botón "💰 Caja repartidor" en la barra de acciones | Abre el modal completo |
| Tab "Caja" de Delivery | Se mantiene la tab pero renderiza `<DriverCashModal embedded />` sin wrapper de modal | Para quienes prefieren la vista integrada |
| Futuro: vista Finanzas/Caja | Botón "Cajas repartidores" en el panel de caja | Solo las sesiones, sin el contexto de Delivery |

**4. Props del modal**

```typescript
interface DriverCashModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  embedded?: boolean;       // true = sin envoltorio modal, para modo tab
  orders: DeliveryOrder[];  // pedidos para vinculación rápida
  defaultFloat?: number;    // fondo por defecto (del settings del negocio)
  onSessionClosed?: (session: DriverCashSession) => void;  // callback para integrar con Caja/Finanzas
}
```

**5. Mantener retrocompatibilidad**

- La tab "Caja" en `Delivery.tsx` sigue existiendo pero renderiza el nuevo componente con `embedded={true}`
- El `renderDriverCashTab()` actual se reemplaza por: `return <DriverCashModal embedded open userId={user.id} orders={orders} />`
- Las funciones de estado (`cashSessions`, `setCashSessions`) se mueven al componente modal o a un hook `useDriverCashSessions(userId)`

#### Criterios de aceptación
- [ ] Componentes extraídos a archivo dedicado (`DriverCashModal.tsx`)
- [ ] Modal funcional con apertura/cierre animado
- [ ] Se puede invocar desde tab Reparto como botón de acción
- [ ] Se puede usar embebido en la tab Caja existente sin regresión
- [ ] Props `onSessionClosed` permite al padre reaccionar al cierre (para FLOT-07)
- [ ] Hook `useDriverCashSessions(userId)` encapsula carga, cache y actualizaciones
- [ ] Responsive: ocupa 90% viewport en móvil, máximo 720px en desktop
- [ ] Dark mode coherente con el diseño actual
- [ ] Sin regresión: toda la funcionalidad actual (apertura, movimientos, cierre, historial) sigue funcionando

---

### FLOT-02 — Bloqueo de sesión duplicada y validación de apertura

**Tipo:** Backend + Frontend
**Prioridad:** Alta
**Dependencias:** FLOT-01

#### Contexto
Actualmente, un mismo repartidor puede tener múltiples sesiones abiertas simultáneamente. Esto provoca confusión: ¿a cuál se le registra el cobro? ¿cuál se cierra? Debe haber una validación que impida abrir una segunda caja si ya existe una abierta para ese repartidor.

#### Qué hacer

**1. Validación en backend (`deliveryController.js` → `createDriverCashSession`)**

Antes de crear la sesión, verificar:

```javascript
const existingSessions = await listDriverCashSessionsByUser(req, userId);
const alreadyOpen = existingSessions.find(
  s => s.driverName === session.driverName && s.status === 'open' && !s.deletedAt
);
if (alreadyOpen) {
  return res.status(409).json({
    ok: false,
    error: `${session.driverName} ya tiene una caja abierta desde ${alreadyOpen.openedAt}`,
    existingSessionId: alreadyOpen._id,
  });
}
```

**2. Validación en frontend**

En `DriverFloatOpenForm`:
- Antes de enviar, comprobar en el listado local si ya hay una sesión abierta para ese nombre
- Si existe: mostrar aviso inline `"Este repartidor ya tiene una caja abierta"` con botón `"Ir a su caja"`
- Deshabilitar el botón "Abrir caja" mientras exista conflicto

**3. Gestión del caso edge: mismo nombre, distinta persona**

Si el negocio tiene dos repartidores con el mismo nombre (raro pero posible):
- Permitir añadir un sufijo identificador (ej: "Carlos P." vs "Carlos M.")
- El campo `driverName` ya es libre, así que esto se resuelve por convención

#### Criterios de aceptación
- [ ] Backend rechaza con `409` si ya existe sesión abierta para el mismo `driverName`
- [ ] Frontend muestra aviso antes de enviar si detecta conflicto
- [ ] El mensaje de error indica desde cuándo está abierta la sesión existente
- [ ] Botón "Ir a su caja" lleva a la sesión activa

---

### FLOT-03 — Edición y eliminación de transacciones

**Tipo:** Frontend + Backend
**Prioridad:** Alta
**Dependencias:** FLOT-01

#### Contexto
Una vez registrado un movimiento en la caja del repartidor, no se puede corregir ni eliminar. Errores comunes: importe equivocado, método de pago incorrecto, cobro duplicado. El repartidor o el gerente necesita poder corregir esto antes del cierre.

#### Qué hacer

**1. Editar transacción**

En la lista de movimientos de `DriverFloatActiveSession`:
- Click/tap en un movimiento abre un formulario inline de edición
- Campos editables: `amount`, `paymentMethod`, `description`, `orderNumber`
- Campos no editables: `type` (cobro/gasto/ajuste), `date`
- Botón "Guardar cambios" actualiza el array `transactions` y llama `updateDriverCashSessionRequest`

**2. Eliminar transacción**

- Botón "Eliminar" con icono papelera en cada movimiento (visible solo para sesiones abiertas)
- Confirmación: `"¿Eliminar este movimiento de X€? Se recalculará el saldo."`
- Al confirmar: filtrar la transacción del array, actualizar sesión en backend, recalcular KPIs

**3. Log de cambios**

Registrar en la transacción quién y cuándo la editó:

```typescript
export interface CashTransaction {
  // ... campos existentes ...
  editedAt?: string;
  editedBy?: string;
  originalAmount?: number;  // guarda el importe original si fue editado
}
```

**4. Protección en sesiones cerradas**

- Las transacciones de sesiones **cerradas** NO se pueden editar ni eliminar
- Si se necesita corregir, primero hay que reabrir la sesión (FLOT-04)

#### Criterios de aceptación
- [ ] Se puede editar importe, método de pago y descripción de un movimiento en sesión abierta
- [ ] Se puede eliminar un movimiento con confirmación
- [ ] Los KPIs y el saldo esperado se recalculan al editar/eliminar
- [ ] Se registra `editedAt`/`editedBy` cuando se modifica un movimiento
- [ ] Se guarda `originalAmount` si el importe cambió
- [ ] Movimientos de sesiones cerradas no son editables/eliminables
- [ ] Log de actividad registra edición y eliminación de movimientos

---

### FLOT-04 — Reapertura de sesión cerrada

**Tipo:** Frontend + Backend
**Prioridad:** Alta
**Dependencias:** FLOT-01

#### Contexto
Si un gerente cierra una caja por error o se detecta un error tras el cierre, no hay forma de reabrir la sesión para corregirla. El gerente tendría que crear una nueva sesión y duplicar movimientos. Debe existir un mecanismo controlado de reapertura.

#### Qué hacer

**1. Botón de reapertura (solo gerente)**

En `DriverFloatClosedSummary`:
- Botón "Reabrir caja" visible solo para perfil gerente (verificar permisos)
- Solo disponible en las últimas 24h después del cierre
- Al hacer click: modal de confirmación con motivo obligatorio

**2. Formulario de reapertura**

```
┌──────────────────────────────────────────┐
│  ⚠ Reabrir caja de Carlos Pérez          │
│                                            │
│  Esta caja se cerró hoy a las 17:15       │
│  con una diferencia de -2.00€.             │
│                                            │
│  Motivo de reapertura *                    │
│  ┌──────────────────────────────────────┐ │
│  │ Error en el conteo final...          │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  [Cancelar]  [Confirmar reapertura]       │
└──────────────────────────────────────────┘
```

**3. Lógica de reapertura**

Al confirmar:
- Cambiar `status` de `'closed'` a `'open'`
- Limpiar `closedAt`, `expectedCash`, `actualCash`, `difference`
- Registrar en la sesión un nuevo campo:

```typescript
reopenHistory?: Array<{
  reopenedAt: string;
  reopenedBy: string;
  reason: string;
  previousClosedAt: string;
  previousDifference: number;
}>;
```

**4. Actualizar modelo y sanitizer**

En `couchdb.js`:
- `buildDriverCashSessionDocument`: añadir campo `reopenHistory` (array)
- `sanitizeDriverCashSession`: incluir `reopenHistory`

En `deliveryApi.ts`:
- Añadir `reopenHistory` a la interface `DriverCashSession`

**5. Log de actividad**

```javascript
action: `Reabrió caja de ${doc.driverName} — Motivo: ${reason}`,
metadata: { previousDifference: doc.difference, reason },
```

#### Criterios de aceptación
- [ ] Botón "Reabrir caja" visible solo para gerente en sesiones cerradas de las últimas 24h
- [ ] Modal de confirmación con motivo obligatorio
- [ ] La sesión pasa a `status: 'open'` y se limpian datos de cierre
- [ ] Se guarda historial de reaperturas en `reopenHistory`
- [ ] Log de actividad registra la reapertura con motivo
- [ ] Tras la reapertura, la sesión aparece de nuevo en "Cajas abiertas"
- [ ] El historial de reaperturas es visible en la sesión cerrada (tras re-cerrar)

---

### FLOT-05 — Justificantes en transacciones

**Tipo:** Frontend + Backend
**Prioridad:** Alta
**Dependencias:** FLOT-01

#### Contexto
Los gastos del repartidor (gasolina, peajes, parking, propinas) necesitan justificante. Actualmente no hay forma de adjuntar una foto o documento a una transacción. Esto es fundamental para el control financiero y para evitar fraudes.

#### Qué hacer

**1. Ampliar tipo `CashTransaction`**

En `deliveryApi.ts`:

```typescript
export interface CashTransaction {
  // ... campos existentes ...
  attachments?: Array<{
    id: string;
    name: string;
    url: string;        // URL de la imagen/doc en el almacenamiento
    type: string;       // 'image/jpeg', 'application/pdf', etc.
    uploadedAt: string;
    uploadedBy?: string;
  }>;
  requiresJustification?: boolean;  // true para gastos > umbral configurable
}
```

**2. UI de adjuntar justificante**

En el formulario de "Nuevo movimiento" (`DriverFloatActiveSession`):
- Si `txType === 'gasto'`: mostrar sección "Justificante" debajo del importe
- Botón "📷 Adjuntar foto" que abre el selector de archivos (cámara en móvil via Capacitor)
- Botón "📄 Adjuntar documento" para PDFs
- Preview thumbnail de la imagen adjunta antes de guardar
- Se puede adjuntar 0-3 archivos por transacción

En la lista de movimientos:
- Icono de clip 📎 en movimientos que tienen adjuntos
- Click abre un lightbox con las imágenes/documentos

**3. Almacenamiento**

Utilizar el mismo patrón de almacenamiento de documentos que ya usa el módulo de Documentación:
- Subida como attachment de CouchDB (si es < 5MB) o al almacenamiento configurado
- URL relativa al servidor

**4. Indicador de gasto sin justificante**

En `DriverFloatActiveSession` y `DriverFloatClosedSummary`:
- Los gastos sin adjuntos muestran badge "⚠ Sin justificante"
- Al cerrar la caja: aviso si hay gastos sin justificante `"Hay X gastos sin justificante. ¿Continuar?"`
- El gerente puede configurar un umbral: gastos por encima de ese importe requieren justificante obligatorio

**5. Configuración del umbral**

Nuevo campo en configuración del negocio:

```typescript
driverCashConfig?: {
  requireJustificationAbove: number;  // default: 10 (€), 0 = nunca requerir
  defaultFloat: number;               // default: 50 (€)
}
```

#### Criterios de aceptación
- [ ] Se puede adjuntar foto/documento a una transacción de gasto
- [ ] Preview de imagen antes de guardar
- [ ] Icono visual en movimientos con adjuntos
- [ ] Lightbox para ver adjuntos en detalle
- [ ] Badge "Sin justificante" en gastos sin adjuntos
- [ ] Aviso al cerrar si hay gastos sin justificante
- [ ] Umbral configurable por el gerente
- [ ] Funciona desde móvil con cámara (Capacitor)

---

### FLOT-06 — Automatización: cobro desde pedido entregado

**Tipo:** Frontend + Backend
**Prioridad:** Alta
**Dependencias:** FLOT-01

#### Contexto
Actualmente existe el "cobro rápido" que permite al gestor vincular manualmente un cobro a un pedido entregado desde la card de la sesión activa. Pero cuando un repartidor marca un pedido como "entregado" con método de pago "efectivo" desde su app/vista, ese cobro debería registrarse automáticamente en su sesión de caja abierta.

#### Qué hacer

**1. Hook en cambio de estado de pedido**

Cuando un pedido (`delivery_order`) cambia a `status === 'delivered'`:

```
1. Verificar si el repartidor asignado (assignedDriver) tiene sesión de caja abierta
2. Si SÍ tiene sesión abierta:
   a. Verificar si ya existe una transacción con orderId === pedido._id
   b. Si NO existe:
      - Crear CashTransaction automática:
        type: 'cobro'
        paymentMethod: pedido.paymentMethod || 'efectivo'
        amount: pedido.totalAmount
        description: "Cobro automático {orderNumber} — {customerName}"
        orderNumber: pedido.orderNumber
        orderId: pedido._id
        date: new Date().toISOString()
      - Añadir al array transactions de la sesión
      - Actualizar la sesión en backend
3. Si NO tiene sesión abierta:
   - Generar alerta: "Cobro de pedido {orderNumber} sin caja abierta para {driverName}"
```

**2. Configuración opt-in**

En `driverCashConfig`:

```typescript
driverCashConfig?: {
  // ... campos anteriores ...
  autoRegisterDeliveryPayments: boolean;  // default: true
}
```

Si está desactivado, se mantiene solo el cobro rápido manual existente.

**3. Indicador visual en la transacción**

Las transacciones automáticas muestran badge "⚡ Auto" para distinguirlas de las manuales.

**4. Actualizar `deliveryController.js`**

Modificar la función que actualiza el estado del pedido (`updateDeliveryOrder` o equivalente):
- Al detectar transición a `delivered`, invocar la lógica de auto-cobro
- Asegurar atomicidad: si el pedido se actualiza pero la transacción falla, loguear el error pero no bloquear la entrega

#### Criterios de aceptación
- [ ] Al marcar pedido como entregado, se crea transacción automática en la sesión del repartidor
- [ ] No crea duplicados si ya existe transacción para ese pedido
- [ ] Badge "⚡ Auto" distingue transacciones automáticas de manuales
- [ ] Si el repartidor no tiene caja abierta, se genera alerta (FLOT-08)
- [ ] Configuración opt-in para activar/desactivar la automatización
- [ ] La automatización funciona con todos los métodos de pago (efectivo, tarjeta, bizum)
- [ ] Si falla la creación de la transacción, el pedido se marca como entregado igualmente (no bloquea)

---

### FLOT-07 — Integración cierre → Caja / Finanzas

**Tipo:** Backend + Frontend
**Prioridad:** Crítica
**Dependencias:** FLOT-01, FIN-01 (Cuentas bancarias de `FINANZAS.md`)

#### Contexto
Cuando se cierra la caja de un repartidor, el resultado (efectivo recaudado, gastos, diferencia) queda aislado en el módulo de Delivery. No se refleja en el módulo de Finanzas, no actualiza ningún saldo de caja, y no genera movimiento contable. El cierre del repartidor es el punto donde el dinero físico "entra" al negocio — esa entrada debe quedar reflejada.

#### Qué hacer

**1. Generar movimientos financieros al cerrar**

Al ejecutar `handleCloseSession`, después de guardar la sesión como `closed`:

```
1. Crear movimiento COBRO en finanzas:
   concept: "Cierre caja repartidor {driverName} — {fecha}"
   totalAmount: actualCash (el efectivo realmente entregado)
   type: 'cobro'
   category: 'efectivo_reparto'
   payMethod: 'efectivo'
   bankAccountId: cuenta "Caja" del negocio (si existe)
   reference: session._id
   linkedEntityId: session._id
   linkedEntityType: 'driver_cash_session'

2. Si hay diferencia negativa (faltante):
   concept: "Descuadre caja repartidor {driverName}: {difference}€"
   totalAmount: Math.abs(difference)
   type: 'pago' (gasto)
   category: 'descuadre_caja'
   reference: session._id

3. Si hay diferencia positiva (sobrante):
   concept: "Sobrante caja repartidor {driverName}: +{difference}€"
   totalAmount: difference
   type: 'cobro'
   category: 'sobrante_caja'
   reference: session._id
```

**2. Resumen de cierre previo a confirmación**

Ampliar el formulario de cierre para mostrar lo que se generará:

```
┌──────────────────────────────────────────────────────────┐
│  🔒 Resumen de cierre — Carlos Pérez                      │
│                                                            │
│  Fondo inicial:           50.00€                          │
│  Cobros efectivo:       +137.50€                          │
│  Gastos:                 -18.50€                          │
│  ─────────────────────────────────                        │
│  Efectivo esperado:      169.00€                          │
│  Efectivo contado:       167.00€                          │
│  Diferencia:              -2.00€  ← Faltante              │
│                                                            │
│  Al confirmar se registrará:                               │
│  ✓ Ingreso de 167.00€ en Caja (efectivo repartidor)      │
│  ✓ Incidencia de -2.00€ (descuadre caja)                 │
│                                                            │
│  Notas de cierre:                                          │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Posible error de cambio en pedido #0047              │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  [Cancelar]  [Confirmar y cerrar caja]                    │
└──────────────────────────────────────────────────────────┘
```

**3. Callback al padre**

Usar el prop `onSessionClosed` de FLOT-01 para que el componente padre (Delivery, Finanzas) pueda ejecutar acciones post-cierre:
- Refrescar saldos de caja
- Mostrar confirmación con link al movimiento creado
- Actualizar KPIs del dashboard

**4. Si el módulo de Finanzas no tiene FIN-01 implementado**

Si aún no existen cuentas bancarias (FIN-01), el cierre funciona igual pero:
- No se crea movimiento financiero automáticamente
- Se muestra un aviso: "Activa el módulo de finanzas para contabilizar automáticamente los cierres"
- Los datos de cierre quedan en la sesión para poder reconciliar después

#### Criterios de aceptación
- [ ] Al cerrar caja, se crea movimiento de ingreso en finanzas con el efectivo real entregado
- [ ] Si hay faltante, se crea movimiento de gasto por el descuadre
- [ ] Si hay sobrante, se crea movimiento de ingreso por el sobrante
- [ ] El resumen pre-cierre muestra claramente qué se registrará
- [ ] Los movimientos creados tienen referencia al `session._id` para trazabilidad
- [ ] Si Finanzas no está configurado, el cierre funciona igualmente sin error
- [ ] Callback `onSessionClosed` permite integraciones del padre

---

### FLOT-08 — Sistema de alertas de repartidor

**Tipo:** Backend
**Prioridad:** Alta
**Dependencias:** FLOT-01, FLOT-06

#### Contexto
El `alertEngine.js` actual no tiene ninguna regla para las sesiones de caja de repartidores. Los requisitos exigen tres alertas específicas: repartidor sin cerrar, descuadre de flotante, y cobro en efectivo sin registrar.

#### Qué hacer

**1. Alerta: Repartidor sin cerrar caja**

```javascript
async function checkDriverSessionsOpen(userId, driverSessions, config) {
  if (!config.driverSessionOpenEnabled) return [];
  const now = new Date();
  const alerts = [];

  const maxHours = config.driverSessionMaxOpenHours || 10;
  const openSessions = driverSessions.filter(
    s => s.status === 'open' && !s.deletedAt
  );

  for (const session of openSessions) {
    const hoursOpen = (now - new Date(session.openedAt)) / (1000 * 60 * 60);
    if (hoursOpen >= maxHours) {
      alerts.push(await emitAlert({
        userId,
        dedupKey: `driversessionopen-${session._id}`,
        level: hoursOpen >= maxHours * 1.5 ? 'alert' : 'warning',
        category: 'driver_session_open',
        title: 'Repartidor sin cerrar caja',
        message: `${session.driverName} tiene la caja abierta desde las ${new Date(session.openedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' })} (${Math.floor(hoursOpen)}h). Fondo inicial: ${session.initialFloat.toFixed(2)}€.`,
        entityId: session._id,
        entityType: 'driver_cash_session',
        route: '/saas/delivery',
        metadata: { driverName: session.driverName, hoursOpen: Math.floor(hoursOpen), initialFloat: session.initialFloat },
      }));
    }
  }

  return alerts.filter(Boolean);
}
```

**2. Alerta: Descuadre de flotante**

```javascript
async function checkDriverSessionMismatch(userId, driverSessions, config) {
  if (!config.driverMismatchEnabled) return [];
  const alerts = [];

  const threshold = config.driverMismatchThreshold || 5; // euros
  const recentClosed = driverSessions.filter(s =>
    s.status === 'closed'
    && !s.deletedAt
    && Math.abs(s.difference) >= threshold
    && daysBetween(s.closedAt, new Date()) <= 1
  );

  for (const session of recentClosed) {
    const direction = session.difference < 0 ? 'faltante' : 'sobrante';
    alerts.push(await emitAlert({
      userId,
      dedupKey: `drivermismatch-${session._id}`,
      level: Math.abs(session.difference) >= threshold * 3 ? 'alert' : 'warning',
      category: 'driver_cash_mismatch',
      title: 'Descuadre de caja repartidor',
      message: `${session.driverName} cerró con ${direction} de ${Math.abs(session.difference).toFixed(2)}€. Esperado: ${session.expectedCash.toFixed(2)}€, real: ${session.actualCash.toFixed(2)}€.`,
      entityId: session._id,
      entityType: 'driver_cash_session',
      route: '/saas/delivery',
      metadata: { driverName: session.driverName, difference: session.difference, expectedCash: session.expectedCash, actualCash: session.actualCash },
    }));
  }

  return alerts.filter(Boolean);
}
```

**3. Alerta: Cobro efectivo sin registrar**

```javascript
async function checkUnregisteredCashPayments(userId, orders, driverSessions, config) {
  if (!config.unregisteredCashEnabled) return [];
  const now = new Date();
  const alerts = [];

  const deliveredToday = orders.filter(o =>
    o.status === 'delivered'
    && o.assignedDriver
    && o.deliveredAt
    && daysBetween(o.deliveredAt, now) === 0
  );

  for (const order of deliveredToday) {
    const session = driverSessions.find(s =>
      s.driverName === order.assignedDriver
      && s.status === 'open'
    );

    if (!session) continue; // sin sesión abierta → lo cubre la alerta de sesión abierta

    const hasTx = session.transactions.some(tx => tx.orderId === order._id);
    if (!hasTx) {
      alerts.push(await emitAlert({
        userId,
        dedupKey: `unregcash-${order._id}`,
        level: 'warning',
        category: 'unregistered_cash_payment',
        title: 'Cobro sin registrar en caja',
        message: `Pedido ${order.orderNumber} (${order.totalAmount.toFixed(2)}€) entregado por ${order.assignedDriver} sin cobro registrado en su caja.`,
        entityId: order._id,
        entityType: 'delivery_order',
        route: '/saas/delivery',
        metadata: { orderNumber: order.orderNumber, totalAmount: order.totalAmount, driverName: order.assignedDriver },
      }));
    }
  }

  return alerts.filter(Boolean);
}
```

**4. Configuración en `alertConfig`**

Añadir a `getAlertConfig()` en `alertEngine.js`:

```javascript
// Caja repartidor
driverSessionOpenEnabled: cfg.driverSessionOpenEnabled !== false,
driverSessionMaxOpenHours: Number(cfg.driverSessionMaxOpenHours || 10),
driverMismatchEnabled: cfg.driverMismatchEnabled !== false,
driverMismatchThreshold: Number(cfg.driverMismatchThreshold || 5),
unregisteredCashEnabled: cfg.unregisteredCashEnabled !== false,
```

**5. Integrar en `runAlertsForUser()`**

Añadir al `Promise.all` de carga de datos:
- `driverSessions` (desde DB delivery, tipo `driver_cash_session`)

Ejecutar las 3 funciones de chequeo pasando las sesiones y pedidos.

**6. Banner de alertas en el modal (FLOT-01)**

El banner de alertas del modal de flotante consume las alertas de categorías `driver_session_open`, `driver_cash_mismatch`, y `unregistered_cash_payment`.

#### Criterios de aceptación
- [ ] `checkDriverSessionsOpen()` detecta cajas abiertas más de X horas (configurable)
- [ ] `checkDriverSessionMismatch()` detecta descuadres superiores al umbral (configurable)
- [ ] `checkUnregisteredCashPayments()` detecta pedidos entregados sin cobro en la caja del repartidor
- [ ] Las 3 reglas integradas en el ciclo del `alertEngine`
- [ ] Configuración de activación/desactivación y umbrales por regla
- [ ] Notificaciones in-app + SSE + Web Push como las alertas existentes
- [ ] Las alertas se muestran en el banner del modal de flotante (FLOT-01)

---

### FLOT-09 — Validación y firma del gerente

**Tipo:** Frontend + Backend
**Prioridad:** Alta
**Dependencias:** FLOT-01, FLOT-04

#### Contexto
El cierre actual es unilateral: cualquiera que tenga acceso puede cerrar la caja sin validación. El requisito indica que el perfil gerente "configura y valida cierres". Debe existir un flujo donde el gerente revise y apruebe (o rechace) un cierre.

#### Qué hacer

**1. Nuevo estado intermedio: `pending_review`**

Ampliar el flujo de estados de la sesión:

```
open → pending_review → closed
                      → reopened (si el gerente rechaza)
```

Actualizar el campo `status` en el modelo:

```typescript
status: 'open' | 'pending_review' | 'closed';
```

**2. Flujo de cierre con revisión**

Cuando el **trabajador** cierra su caja:
- Se calcula `expectedCash`, `actualCash`, `difference`
- El estado pasa a `pending_review`
- Se notifica al gerente

Cuando el **gerente** revisa:
- Ve el resumen completo del cierre
- Puede aprobar → estado pasa a `closed`, se ejecuta la integración con Finanzas (FLOT-07)
- Puede rechazar → estado vuelve a `open`, se añade nota de rechazo
- Puede ajustar `actualCash` si el gerente recontó

**3. Configuración opt-in**

```typescript
driverCashConfig?: {
  // ... campos anteriores ...
  requireManagerApproval: boolean;  // default: false
}
```

Si `requireManagerApproval` es `false`:
- El cierre es directo (como funciona ahora)
- Cualquier usuario con permiso puede cerrar

Si `requireManagerApproval` es `true`:
- El trabajador solo puede poner en `pending_review`
- Solo el gerente puede pasar a `closed`

**4. Vista de cierres pendientes de revisión**

En el modal de flotante, sección nueva entre "Cajas abiertas" e "Historial":

```
── PENDIENTES DE REVISIÓN (1) ─────────────────────────────
┌─ Carlos Pérez · Cerrada a las 17:15 ────────────────────┐
│  Efectivo esperado: 169.00€                               │
│  Efectivo contado:  167.00€                               │
│  Diferencia: -2.00€                                       │
│  Notas: "Posible error de cambio en pedido #0047"        │
│                                                           │
│  [✕ Rechazar]  [Ajustar efectivo]  [✓ Aprobar cierre]   │
└──────────────────────────────────────────────────────────┘
```

**5. Actualizar modelo**

En `couchdb.js` y `deliveryApi.ts`:

```typescript
reviewedBy?: string;      // userId del gerente que aprobó
reviewedAt?: string;
reviewNotes?: string;     // notas del gerente al aprobar/rechazar
```

#### Criterios de aceptación
- [ ] Nuevo estado `pending_review` funcional en el modelo y la UI
- [ ] Configuración `requireManagerApproval` activa/desactiva el flujo de revisión
- [ ] Si está activo: trabajador cierra → `pending_review`, gerente aprueba → `closed`
- [ ] Si está inactivo: cierre directo (sin regresión)
- [ ] El gerente puede aprobar, rechazar o ajustar el efectivo
- [ ] Al aprobar, se ejecuta la integración con Finanzas (FLOT-07)
- [ ] Al rechazar, la sesión vuelve a `open` con nota de rechazo
- [ ] Sección "Pendientes de revisión" en el modal
- [ ] Campos `reviewedBy`, `reviewedAt`, `reviewNotes` se guardan
- [ ] Log de actividad registra la aprobación/rechazo

---

### FLOT-10 — Vista trabajador: gestión de su propia caja

**Tipo:** Frontend
**Prioridad:** Media
**Dependencias:** FLOT-01, FLOT-06

#### Contexto
Actualmente solo el gestor puede ver y operar las cajas de repartidores desde `Delivery.tsx`. El repartidor no tiene acceso a su propia sesión de caja. Los requisitos indican: "Perfil trabajador: abre, usa y cierra su flotante si hace reparto". El repartidor necesita poder ver su saldo, registrar cobros/gastos, y cerrar su caja desde su propia vista.

#### Qué hacer

**1. Widget "Mi caja" en la vista de trabajador**

Si el usuario actual tiene rol de repartidor y tiene una sesión abierta, mostrar un widget compacto en su vista principal:

```
┌────────────────────────────────────────────────────┐
│  💰 Mi caja — Turno de hoy                          │
│                                                      │
│  Fondo: 50€ | Cobros: 137.50€ | Gastos: 18.50€     │
│  Efectivo esperado: 169.00€                          │
│                                                      │
│  Último movimiento: 14:32 · Cobro #0045 · +34.50€  │
│                                                      │
│  [+ Registrar cobro]  [+ Registrar gasto]           │
│  [🔒 Cerrar mi caja]                                │
└────────────────────────────────────────────────────┘
```

**2. Determinar dónde va el widget**

| Vista del trabajador | Ubicación del widget |
|---|---|
| `src-delivery/` (si aplica) | Card principal en el dashboard del repartidor |
| Dashboard SaaS (`Dashboard.tsx`) | Sección condicional si el usuario tiene sesión de caja abierta |
| Vista de pedidos del repartidor | Banner superior con resumen + acciones rápidas |

**3. Acciones del trabajador**

El trabajador puede:
- Ver resumen de su caja (saldo, movimientos, KPIs)
- Registrar cobros y gastos manuales
- Ver pedidos entregados sin cobrar y hacer cobro rápido
- Cerrar su caja (si `requireManagerApproval` es `false`, se cierra directamente; si es `true`, pasa a `pending_review`)

El trabajador **no puede**:
- Abrir una nueva caja (solo el gerente)
- Reabrir una caja cerrada
- Editar transacciones de otros repartidores
- Ver cajas de otros repartidores
- Modificar la configuración

**4. Filtrado por identidad**

Para encontrar "su" sesión:
- Buscar sesión donde `driverName` coincida con el nombre del usuario logueado
- O donde un nuevo campo `driverUserId` coincida con su `userId` (más robusto)

Propuesta: añadir `driverUserId?: string` al modelo `driver_cash_session` para vincular opcionalmente la sesión con una cuenta de usuario del sistema.

**5. API de acceso**

El endpoint actual `/api/delivery/driver-sessions/:userId` ya filtra por `userId` del negocio. Para que el trabajador acceda a su propia sesión, necesita:
- Nuevo endpoint o query param: `GET /api/delivery/driver-sessions/:userId?driver=self` que filtre por `driverUserId` del token
- O filtrar client-side desde la lista completa (menos eficiente pero funcional)

#### Criterios de aceptación
- [ ] Widget "Mi caja" visible para trabajadores con sesión activa
- [ ] El trabajador puede ver su saldo, movimientos y KPIs
- [ ] Puede registrar cobros y gastos desde su vista
- [ ] Puede cerrar su caja (respetando configuración de aprobación)
- [ ] No puede operar cajas de otros repartidores
- [ ] No puede abrir cajas ni modificar configuración
- [ ] Campo `driverUserId` vincula sesión con cuenta de usuario
- [ ] El widget se oculta si no hay sesión activa

---

### FLOT-11 — Historial filtrable y exportación

**Tipo:** Frontend
**Prioridad:** Media
**Dependencias:** FLOT-01

#### Contexto
El historial de sesiones cerradas muestra las últimas 20 sin filtros. Para control de gestión y auditoría, el gerente necesita filtrar por fecha, repartidor, rango de importes, y exportar los datos.

#### Qué hacer

**1. Barra de filtros en el historial**

```
── HISTORIAL ──── [📅 Fecha ▼] [👤 Repartidor ▼] [📊 Estado ▼] ── [Exportar ▼] ──
```

| Filtro | Tipo | Opciones |
|---|---|---|
| Fecha | Rango | Hoy / Ayer / Última semana / Último mes / Personalizado |
| Repartidor | Selector múltiple | Lista de nombres de repartidores con sesiones |
| Con descuadre | Toggle | Solo sesiones con `difference !== 0` |

**2. KPIs del historial filtrado**

Encima de la lista, mostrar totales del rango seleccionado:

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Sesiones │ │ Total    │ │ Efectivo │ │ Gastos   │ │ Descuadre│
│ 24       │ │ ventas   │ │ recaudado│ │ totales  │ │ neto     │
│          │ │ 4.250€   │ │ 2.840€   │ │ 312€     │ │ -12.40€  │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

**3. Exportación**

| Formato | Contenido |
|---|---|
| CSV | Una fila por sesión: fecha, repartidor, fondo, ventas total, ventas efectivo, ventas tarjeta, ventas bizum, gastos, esperado, real, diferencia, notas |
| CSV detallado | Una fila por transacción: fecha sesión, repartidor, hora tx, tipo, método, importe, descripción, nº pedido |
| PDF | Resumen visual tipo "informe de caja" con logo del negocio, KPIs y tabla |

**4. Paginación**

- Mostrar 20 sesiones por página (ya existe el `.slice(0, 20)`)
- Botón "Cargar más" o paginación numérica
- Indicar total de sesiones en el rango filtrado

#### Criterios de aceptación
- [ ] Filtros funcionales: fecha, repartidor, con descuadre
- [ ] KPIs agregados del rango filtrado
- [ ] Exportación CSV (resumen y detallado) funcional
- [ ] Exportación PDF con formato profesional
- [ ] Paginación con "Cargar más"
- [ ] Los filtros se mantienen al paginar

---

### FLOT-12 — Incidencias por descuadre

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Dependencias:** FLOT-07, FLOT-09

#### Contexto
Cuando un repartidor cierra con un descuadre significativo, esa diferencia debe generar una incidencia formal en el sistema de incidencias existente (`incident` en delivery_order). Esto permite hacer seguimiento, pedir explicaciones, y mantener historial por repartidor.

#### Qué hacer

**1. Crear incidencia automática por descuadre**

Al cerrar (o al aprobar el cierre por parte del gerente):

```
Si Math.abs(difference) >= umbral configurado:
  1. Crear documento de incidencia:
     type: 'cash_incident'
     driverName: session.driverName
     sessionId: session._id
     expectedCash: session.expectedCash
     actualCash: session.actualCash
     difference: session.difference
     status: 'open'
     description: "Descuadre de {difference}€ en cierre de caja"
     closingNotes: session.closingNotes
     createdAt: now

  2. Notificar al gerente si no fue él quien cerró
```

**2. Vista de incidencias de caja**

En la tab "Incidencias" de Delivery, añadir sección o filtro para incidencias de tipo `cash_incident`:

```
── INCIDENCIAS DE CAJA ──────────────────────────────────────
┌─ Carlos Pérez · 14 abr · Descuadre: -15.40€ ───── 🔴 ──┐
│  Esperado: 245.00€ | Real: 229.60€                        │
│  Notas cierre: "No sé qué pasó, conté dos veces"         │
│                                                            │
│  Resolución: _______________                               │
│  [Resolver: descontar nómina] [Resolver: justificado]     │
└───────────────────────────────────────────────────────────┘
```

**3. Opciones de resolución**

| Resolución | Efecto |
|---|---|
| Justificado | Se cierra la incidencia con nota explicativa |
| Descontar de nómina | Se cierra con referencia a descuento; se genera movimiento en finanzas |
| Reponer efectivo | El repartidor devuelve el faltante; se registra nueva transacción |
| Sin resolver | La incidencia queda abierta como registro |

**4. Historial de incidencias por repartidor**

En la configuración o en el perfil del repartidor:
- Listado de todas sus incidencias de caja
- Total acumulado de descuadres
- Indicador de "fiabilidad" (% de cierres sin descuadre)

#### Criterios de aceptación
- [ ] Al cerrar con descuadre >= umbral, se crea incidencia automáticamente
- [ ] La incidencia tiene tipo `cash_incident` diferenciado de incidencias de pedido
- [ ] Vista de incidencias de caja en la tab Incidencias
- [ ] Opciones de resolución funcionales (justificar, descontar, reponer)
- [ ] Historial de incidencias por repartidor consultable
- [ ] Umbral de descuadre configurable por el gerente

---

### FLOT-13 — Configuración del gerente

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Dependencias:** FLOT-01

#### Contexto
Varios tickets anteriores mencionan configuraciones (`defaultFloat`, `requireManagerApproval`, `requireJustificationAbove`, etc.) que el gerente debe poder ajustar. Actualmente no existe una UI de configuración para la caja de repartidores.

#### Qué hacer

**1. Panel de configuración**

Accesible desde el botón "⚙ Configurar" del modal de flotante (FLOT-01):

```
┌──────────────────────────────────────────────────────┐
│  ⚙ Configuración de caja repartidor                   │
│                                                        │
│  APERTURA                                              │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Fondo por defecto:        [50] €                 │ │
│  │ Bloquear sesión duplicada: [✓]                   │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  AUTOMATIZACIÓN                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Auto-registrar cobro al entregar: [✓]            │ │
│  │ Integrar cierre con Finanzas:     [✓]            │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  CIERRE Y CONTROL                                      │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Requerir aprobación del gerente:  [○]            │ │
│  │ Umbral descuadre para incidencia: [5] €          │ │
│  │ Justificante obligatorio desde:   [10] €         │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  ALERTAS                                               │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Alerta caja sin cerrar tras:      [10] horas     │ │
│  │ Alerta descuadre:                 [✓]            │ │
│  │ Alerta cobro sin registrar:       [✓]            │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  [Restaurar valores por defecto]  [Guardar]           │
└──────────────────────────────────────────────────────┘
```

**2. Almacenamiento**

Guardar la configuración en el documento de settings del negocio (patrón existente en `settingsController.js`):

```typescript
interface DriverCashConfig {
  defaultFloat: number;                     // 50
  blockDuplicateSession: boolean;           // true
  autoRegisterDeliveryPayments: boolean;    // true
  integrateWithFinance: boolean;            // true
  requireManagerApproval: boolean;          // false
  mismatchIncidentThreshold: number;        // 5 (€)
  requireJustificationAbove: number;        // 10 (€)
  driverSessionMaxOpenHours: number;        // 10
  driverMismatchAlertEnabled: boolean;      // true
  unregisteredCashAlertEnabled: boolean;    // true
}
```

**3. Endpoint**

```
GET  /api/settings/driver-cash/:userId     → devuelve config (o defaults)
PUT  /api/settings/driver-cash/:userId     → guarda config
```

Reutilizar el patrón de `settingsController.js` existente.

**4. Consumo de la configuración**

Los componentes de flotante (`DriverCashModal`, `DriverFloatOpenForm`, etc.) reciben la configuración via prop o hook `useDriverCashConfig(userId)` y la aplican en:
- Formulario de apertura → fondo por defecto
- Formulario de cierre → flujo con/sin aprobación
- Formulario de movimiento → justificante obligatorio desde X€
- Alertas → umbrales

#### Criterios de aceptación
- [ ] Panel de configuración accesible desde el modal
- [ ] Todos los parámetros configurables se guardan y persisten
- [ ] Valores por defecto razonables si no se ha configurado nada
- [ ] Endpoint `GET/PUT /api/settings/driver-cash/:userId` funcional
- [ ] Hook `useDriverCashConfig` proporciona la config a los componentes
- [ ] Botón "Restaurar valores por defecto" funcional
- [ ] Solo accesible para perfil gerente (verificar permisos)

---

## Orden de ejecución recomendado

```
Fase 1 — Refactor y base
├── FLOT-01  Modal de flotante (componente reutilizable)
├── FLOT-02  Bloqueo de sesión duplicada
└── FLOT-13  Configuración del gerente

Fase 2 — Mejoras operativas
├── FLOT-03  Edición y eliminación de transacciones
├── FLOT-04  Reapertura de sesión cerrada
└── FLOT-05  Justificantes en transacciones

Fase 3 — Automatización
├── FLOT-06  Automatización: cobro desde pedido entregado
└── FLOT-07  Integración cierre → Caja / Finanzas

Fase 4 — Alertas y control
├── FLOT-08  Sistema de alertas de repartidor
├── FLOT-09  Validación y firma del gerente
└── FLOT-12  Incidencias por descuadre

Fase 5 — Experiencia del trabajador
├── FLOT-10  Vista trabajador: su propia caja
└── FLOT-11  Historial filtrable y exportación
```

## Estimación de esfuerzo

| Ticket | Complejidad | Estimación |
|---|---|---|
| FLOT-01 Modal reutilizable | Alta | 5-6h |
| FLOT-02 Bloqueo sesión duplicada | Baja | 1-2h |
| FLOT-03 Edición/eliminación transacciones | Media | 3-4h |
| FLOT-04 Reapertura de sesión | Media | 2-3h |
| FLOT-05 Justificantes | Alta | 5-6h |
| FLOT-06 Auto-cobro desde pedido | Alta | 4-5h |
| FLOT-07 Integración cierre → Finanzas | Alta | 5-6h |
| FLOT-08 Sistema de alertas | Media-Alta | 4-5h |
| FLOT-09 Validación gerente | Alta | 5-6h |
| FLOT-10 Vista trabajador | Media | 3-4h |
| FLOT-11 Historial y exportación | Media | 3-4h |
| FLOT-12 Incidencias por descuadre | Media | 3-4h |
| FLOT-13 Configuración del gerente | Media | 3-4h |
| **Total** | | **~46-59h** |

---

## Mapa de conexiones

```
                    ┌──────────────┐
                    │   REPARTO    │
                    │ (Delivery)   │
                    └──────┬───────┘
                           │ pedidos entregados (FLOT-06)
                           │ invocar modal (FLOT-01)
                           ▼
┌──────────────┐   ┌──────────────────┐   ┌──────────────┐
│   CAJA       │◄──│  FLOTANTE        │──►│  FINANZAS    │
│ (TPV/PDV)    │   │  REPARTIDOR      │   │ (Finance)    │
│              │   │                  │   │              │
│ Recoge el    │   │  FLOT-01..13     │   │ Recibe       │
│ efectivo     │   │                  │   │ cierre como  │
│ del cierre   │   └────────┬─────────┘   │ movimiento   │
└──────────────┘            │             │ (FLOT-07)    │
                            │             └──────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
     ┌──────────────┐ ┌──────────┐ ┌──────────────┐
     │ ALERTAS      │ │ INCIDEN- │ │ CONFIGURA-   │
     │ (alertEngine)│ │ CIAS     │ │ CIÓN         │
     │              │ │          │ │              │
     │ 3 nuevas     │ │ Auto por │ │ Umbrales,    │
     │ reglas       │ │ descuadre│ │ aprobaciones │
     │ (FLOT-08)    │ │ (FLOT-12)│ │ (FLOT-13)    │
     └──────────────┘ └──────────┘ └──────────────┘
```

## Notas técnicas

### Base de datos
Los documentos `driver_cash_session` ya existen en la DB delivery (`getDeliveryDbName()`). Los nuevos campos (`reopenHistory`, `reviewedBy`, `driverUserId`, `attachments` en transacciones) son retrocompatibles — CouchDB no requiere migraciones. Los campos opcionales se acceden con fallback a `undefined`.

### Retrocompatibilidad
- Las sesiones existentes sin los nuevos campos siguen funcionando
- El estado `pending_review` es opt-in (solo si `requireManagerApproval === true`)
- La automatización de cobros (FLOT-06) es opt-in
- La integración con finanzas (FLOT-07) funciona solo si el módulo de finanzas está configurado
- El modal (FLOT-01) puede usarse embebido como tab sin romper la UI actual

### Permisos
- **Gerente**: todas las acciones (abrir, cerrar, reabrir, aprobar, configurar, ver todas las cajas)
- **Trabajador**: ver su caja, registrar movimientos, cerrar su caja (con o sin aprobación), NO puede reabrir, NO puede configurar, NO puede ver cajas de otros

### Patrón de código
Seguir los patrones existentes:
- Controllers: `async (req, res)` con `findAccountByUserId`, validación de `userId`, respuesta `{ ok, ... }`, `logAccountActivity`
- API client: funciones en `deliveryApi.ts` con `request<T>()` y `normalizeUserId()`
- Componentes: inline dentro del archivo de página o en subcarpeta `components/delivery/`
- Hooks: `useDriverCashSessions(userId)` similar a otros hooks de carga de datos del proyecto

### Capacitor (móvil)
Los justificantes (FLOT-05) y la vista de trabajador (FLOT-10) deben funcionar en la app móvil:
- Usar `Camera` plugin de Capacitor para adjuntar fotos
- El widget "Mi caja" debe ser táctil-friendly con botones grandes
