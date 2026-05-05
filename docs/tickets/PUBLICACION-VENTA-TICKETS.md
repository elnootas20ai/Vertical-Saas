# PUBLICACIÓN Y VENTA — Plan de Tickets

**Página:** `/saas/vertical/compraventa/publicacion-venta`
**Objetivo:** Preparar un vehículo para vender y controlar su salida comercial.
**Fecha:** 2026-04-14

---

## Auditoría de lo existente

### Lo que YA funciona

| Componente | Estado | Ruta / Archivo |
|---|---|---|
| Documento vehículo (`type: 'car'`) con CRUD completo | Completo | `vehicleController.js`, `buildVehicleDocument` en `couchdb.js` |
| Precio de venta (`salePrice`) | Completo | Campo opcional en `buildVehicleDocument` |
| Historial de cambios de precio (`priceHistory`) | Parcial | Backend registra cambios con append-only, pero el frontend **no envía** `priceChangeReason` (motivo siempre queda en "Sin motivo especificado") |
| Fotos del vehículo (`images`) | Completo | Array de URLs/data-URLs; `PhotoGallery` en `VehicleDetail.tsx` con compresión, validación y reordenación drag |
| Estado de inventario (`status`) | Completo | Valores: `available`, `reserved`, `sold`, `workshop`, `scrapped` — normalizados en `normalizeStatus` |
| Pestaña "Publicar" en detalle de vehículo | Parcial | `PortalPublishSection` genera **plantillas de texto** para Coches.net, Milanuncios y Wallapop (copiar/pegar). **No** hay estado "publicado en X" ni sincronización |
| Microsite público (`/v/{id}`) | Completo | API `GET /api/public/vehicle/:vehicleId` + URL pública con fotos, descripción y precio (matrícula enmascarada) |
| Margen en UI | Parcial | `VehicleDetail.tsx` calcula `salePrice - (purchasePrice + costes taller + costes asociados)` — solo visual, no persistido ni con detección de mínimos |
| Vista CouchDB `margin_by_user` | Parcial | Calcula `salePrice - purchasePrice` para vendidos — **no incluye** costes de preparación |
| Costes asociados (`associatedCosts`) | Completo | Categorías: `preparacion`, `itv`, `limpieza`, `fotos`, `publicidad`, `otro` |
| Campo `notes` (notas internas) | Completo | Texto libre único — se usa como notas internas, **no** como descripción comercial |
| Notas internas del vehículo | Completo | Campo `notes` en `buildVehicleDocument` |
| Alerta `vehicle_stock_aging` | Completo | `alertEngine.js` — vehículos `available` demasiado tiempo en stock; configurable por días |
| Alerta `low_sales_velocity` | Completo | `alertEngine.js` — ritmo de ventas del mes vs histórico |
| Operación de venta (`type: 'sale'`) | Completo | `buildSaleDocument` con pipeline (`interested` → `reserved` → `documentation` → `sold` → `delivered`), `responsible`, `minimumPrice`, `priceHistory` |
| Métricas de ventas | Completo | `salesMetricsController.js` — agregaciones por fecha |
| Diff de cambios (changelog) | Parcial | `vehicleChangeDiff` trackea: `status`, `salePrice`, `purchasePrice`, `registrationPlate`, `mileage`, `location`, `brand`, `model`, `year`, `color` — **no** incluye nuevos campos comerciales |
| API pública de vehículos (Bearer token) | Completo | `publicApiRouter.js` — `GET /api/v1/vehicles` |
| Permisos de equipo | Completo | `TEAM_PERMISSION_KEYS` incluye `'vehicles'` |

### Lo que FALTA

| Funcionalidad | Estado |
|---|---|
| Descripción comercial (texto para anuncio, independiente de notas internas) | No existe — solo `notes` como notas internas |
| Estado comercial del vehículo (en preparación, listo para vender, publicado, reservado, vendido) | No existe — solo `status` de inventario que mezcla operativa con comercial |
| Flag "vehículo destacado" (`featured`) | No existe |
| Flag "publicado" (`published`) con fecha | No existe |
| Canales de publicación (en qué portales está publicado, con URL del anuncio) | No existe — la pestaña "Publicar" solo genera texto para copiar |
| Comercial asignado al vehículo | No existe — `responsible` solo existe en la operación de venta (`sale`), no en el vehículo |
| Precio mínimo de venta por vehículo | No existe en el vehículo — solo `minimumPrice` en la operación de venta (`sale`) |
| Cálculo de margen estimado persistido (con costes completos) | No persistido — se calcula en frontend al vuelo |
| Detección automática de precio por debajo del mínimo | No implementada |
| Flujo de transiciones de estado comercial con validaciones | No implementado |
| Alerta: vehículo listo sin publicar | No implementada |
| Alerta: precio por debajo del mínimo configurado | No implementada |
| Alerta: anuncio sin fotos | No implementada |
| Frontend envía `priceChangeReason` al cambiar precio | No conectado — variable declarada en `VehicleDetail.tsx` pero no se envía en la llamada a la API desde `AppContext` |
| Perfil gerente vs trabajador con control diferenciado de precios y publicación | No implementado a nivel de vehículo (el permiso `vehicles` es binario) |
| Página dedicada `/saas/vertical/compraventa/publicacion-venta` | No existe |
| Conexión Publicación → CRM (lead llega, se asigna vehículo publicado) | No implementada |
| Conexión Publicación → Finanzas (margen real al vender) | No implementada |
| Conexión Publicación → Dashboard (vehículos publicados, sin publicar, márgenes) | No implementada |
| Conexión Publicación → Documentación (fotos, contratos, fichas técnicas vinculadas) | No implementada |

---

## Tickets

---

### TICKET PV-01 — Modelo de datos: Campos comerciales del vehículo

**Tipo:** Backend + API Client
**Prioridad:** Crítica
**Dependencias:** Ninguna

#### Contexto

El documento `car` en CouchDB tiene campos de identificación, técnica, económica básica y taller, pero **carece de toda la capa comercial** necesaria para gestionar la publicación y venta: no hay descripción comercial, no hay estado comercial separado del de inventario, no hay flag de publicado/destacado, no hay comercial asignado, y no hay precio mínimo de venta. Todo esto impide que el módulo de publicación y venta funcione como una herramienta real de gestión comercial.

#### Qué hacer

**1. Ampliar `buildVehicleDocument` en `services/couchdb.js`**

Añadir estos campos al documento `car`, todos retrocompatibles (opcionales con fallback):

```javascript
// === BLOQUE COMERCIAL ===

commercialDescription: normalizeOptionalText(data.commercialDescription)
  || existingVehicle?.commercialDescription || '',

commercialStatus: normalizeCommercialStatus(data.commercialStatus)
  || existingVehicle?.commercialStatus || 'preparation',

published: typeof data.published === 'boolean'
  ? data.published
  : existingVehicle?.published ?? false,

publishedAt: data.published === true && !existingVehicle?.published
  ? new Date().toISOString()
  : (data.published === false ? null : existingVehicle?.publishedAt || null),

featured: typeof data.featured === 'boolean'
  ? data.featured
  : existingVehicle?.featured ?? false,

minimumSalePrice: normalizeOptionalNumber(data.minimumSalePrice)
  ?? existingVehicle?.minimumSalePrice ?? null,

assignedCommercialId: normalizeOptionalText(data.assignedCommercialId)
  || existingVehicle?.assignedCommercialId || null,

assignedCommercialName: normalizeOptionalText(data.assignedCommercialName)
  || existingVehicle?.assignedCommercialName || null,

publicationChannels: Array.isArray(data.publicationChannels)
  ? data.publicationChannels
  : existingVehicle?.publicationChannels || [],

estimatedMargin: normalizeOptionalNumber(data.estimatedMargin)
  ?? existingVehicle?.estimatedMargin ?? null,

totalPreparationCost: normalizeOptionalNumber(data.totalPreparationCost)
  ?? existingVehicle?.totalPreparationCost ?? null,

commercialStatusHistory: Array.isArray(data.commercialStatusHistory)
  ? data.commercialStatusHistory
  : existingVehicle?.commercialStatusHistory || [],
```

**2. Crear `normalizeCommercialStatus` en `couchdb.js`**

```javascript
function normalizeCommercialStatus(value) {
  const allowed = [
    'preparation',     // En preparación (recién comprado, en taller, limpieza, fotos pendientes)
    'ready',           // Listo para vender (preparación completa, fotos hechas, precio puesto)
    'published',       // Publicado (anuncio activo en al menos un canal)
    'reserved',        // Reservado (cliente interesado, señal o compromiso)
    'sold',            // Vendido (operación cerrada, pendiente de entrega o entregado)
  ];
  return allowed.includes(String(value || '')) ? String(value) : 'preparation';
}
```

**3. Definir estructura de `publicationChannels`**

Cada entrada del array representa un canal donde el vehículo está publicado:

```typescript
interface VehiclePublicationChannel {
  channelId: string;         // 'coches_net' | 'milanuncios' | 'wallapop' | 'facebook' | 'instagram' | 'autocasion' | 'web_propia' | 'otro'
  channelName: string;       // "Coches.net", "Wallapop", etc.
  url: string;               // URL del anuncio en el portal (para abrir directo)
  publishedAt: string;       // Fecha en que se publicó en este canal
  unpublishedAt: string | null; // Fecha en que se retiró (null = sigue activo)
  active: boolean;           // true = publicado actualmente
  notes: string;             // Notas sobre este canal (ej: "Anuncio destacado pagado")
}
```

**4. Definir estructura de `commercialStatusHistory`**

Cada transición de estado comercial queda registrada:

```typescript
interface CommercialStatusHistoryEntry {
  id: string;                // UUID
  date: string;              // ISO timestamp
  userId: string;
  userName: string;
  fromStatus: string;        // Estado anterior
  toStatus: string;          // Estado nuevo
  reason: string;            // Motivo del cambio
}
```

**5. Actualizar `sanitizeVehicle` en `couchdb.js`**

Incluir los nuevos campos en el objeto sanitizado que se devuelve al frontend.

**6. Actualizar `vehicleChangeDiff` en `vehicleController.js`**

Añadir los nuevos campos al array `TRACKED`:

```javascript
const TRACKED = [
  'status', 'salePrice', 'purchasePrice', 'registrationPlate',
  'mileage', 'location', 'brand', 'model', 'year', 'color',
  // Nuevos campos comerciales
  'commercialStatus', 'published', 'featured', 'minimumSalePrice',
  'assignedCommercialId', 'commercialDescription',
];
```

**7. Actualizar tipos TypeScript en el frontend**

Ampliar el tipo `Vehicle` en `AppContext` (o crear `vehicleTypes.ts`):

```typescript
interface Vehicle {
  // ... campos existentes ...
  commercialDescription: string;
  commercialStatus: CommercialStatus;
  published: boolean;
  publishedAt: string | null;
  featured: boolean;
  minimumSalePrice: number | null;
  assignedCommercialId: string | null;
  assignedCommercialName: string | null;
  publicationChannels: VehiclePublicationChannel[];
  estimatedMargin: number | null;
  totalPreparationCost: number | null;
  commercialStatusHistory: CommercialStatusHistoryEntry[];
}

type CommercialStatus = 'preparation' | 'ready' | 'published' | 'reserved' | 'sold';
```

**8. Retrocompatibilidad**

CouchDB no requiere migraciones. Los vehículos existentes sin los nuevos campos se interpretan con los valores por defecto:
- `commercialStatus` → `'preparation'` (asumimos que los coches antiguos no tenían ficha comercial lista)
- `published` → `false`
- `featured` → `false`
- Resto → `null` o `[]`

#### Criterios de aceptación

- [ ] Documento `car` incluye todos los campos comerciales listados
- [ ] `normalizeCommercialStatus` valida los 5 estados permitidos
- [ ] `publicationChannels` se persiste como array de objetos con la estructura definida
- [ ] `commercialStatusHistory` registra cada transición de estado comercial
- [ ] `sanitizeVehicle` devuelve los nuevos campos al frontend
- [ ] `vehicleChangeDiff` trackea los nuevos campos comerciales
- [ ] Tipos TypeScript actualizados con interfaces completas
- [ ] Vehículos existentes sin los nuevos campos funcionan sin errores (retrocompatibilidad)
- [ ] Tests manuales: crear vehículo nuevo incluye campos; actualizar vehículo existente los añade

---

### TICKET PV-02 — Histórico de precios: Completar flujo y hacer obligatorio el motivo

**Tipo:** Bugfix + Enhancement — Backend + Frontend
**Prioridad:** Alta
**Dependencias:** PV-01

#### Contexto

El backend ya registra el historial de precios en `priceHistory` al cambiar `salePrice`, incluyendo `userId`, `userName`, `oldPrice`, `newPrice` y `reason`. Sin embargo, hay **dos problemas reales**:

1. **El frontend no envía `priceChangeReason`**: en `AppContext`, la función `updateVehicle` llama a `updateVehicleRequest` sin pasar el motivo. Aunque `VehicleDetail.tsx` declara una variable para el motivo, **no se conecta** con la llamada API. Resultado: todos los cambios de precio quedan con motivo "Sin motivo especificado".

2. **No hay validación de motivo obligatorio**: el backend acepta cambios de precio sin motivo y pone un placeholder. Para un control comercial serio, el motivo debería ser obligatorio cuando cambia el precio.

#### Qué hacer

**1. Corregir `updateVehicle` en `AppContext` (o `vehicleApi.ts`)**

La función que actualiza el vehículo debe aceptar y reenviar `priceChangeReason`:

```typescript
async function updateVehicle(
  vehicleId: string,
  vehicleData: Partial<Vehicle>,
  priceChangeReason?: string,
): Promise<Vehicle> {
  const body: Record<string, unknown> = { vehicle: vehicleData };
  if (priceChangeReason) {
    body.priceChangeReason = priceChangeReason;
  }
  return updateVehicleRequest(userId, vehicleId, body);
}
```

**2. Modal obligatorio al cambiar precio en `VehicleDetail.tsx`**

Cuando el usuario modifica `salePrice` y pulsa guardar:

1. Detectar que el precio ha cambiado respecto al valor guardado
2. Abrir un modal **antes de guardar** pidiendo:
   - Motivo del cambio (select + texto libre):
     - `market_adjustment` — "Ajuste de mercado"
     - `client_negotiation` — "Negociación con cliente"
     - `time_in_stock` — "Tiempo en stock"
     - `competitor_price` — "Precio de la competencia"
     - `manager_decision` — "Decisión de gerencia"
     - `error_correction` — "Corrección de error"
     - `other` — "Otro motivo"
   - Campo de texto adicional opcional para detalle
3. No permitir guardar sin seleccionar un motivo
4. Enviar el motivo combinado (categoría + detalle) como `priceChangeReason`

**3. Validación backend: rechazar cambio de precio sin motivo**

En `vehicleController.js`, dentro de `updateVehicle`:

```javascript
if (newPrice !== oldPrice && !priceChangeReason?.trim()) {
  return res.status(400).json({
    error: 'Se requiere un motivo para cambiar el precio de venta.',
    code: 'PRICE_CHANGE_REASON_REQUIRED',
  });
}
```

**4. Mejorar la entrada del historial de precios**

Ampliar la estructura de cada entrada para incluir categoría:

```javascript
{
  id: `ph:${uuidv4()}`,
  date: new Date().toISOString(),
  userId,
  userName: account.fullName || userId,
  oldPrice,
  newPrice,
  reason: String(priceChangeReason || '').trim(),
  reasonCategory: String(priceChangeReasonCategory || 'other').trim(),
  priceVariation: oldPrice ? (((newPrice - oldPrice) / oldPrice) * 100).toFixed(1) : null,
}
```

**5. Indicador visual de tendencia en la UI**

En la sección de historial de precios de `VehicleDetail.tsx`:
- Flecha ↑ verde si subió, ↓ roja si bajó, con porcentaje
- Badge con la categoría del motivo
- Tooltip con el detalle completo

#### Criterios de aceptación

- [ ] Al cambiar precio en la UI, se abre modal pidiendo motivo (obligatorio)
- [ ] El motivo se envía correctamente al backend vía `priceChangeReason`
- [ ] El backend rechaza con 400 si cambia el precio sin motivo
- [ ] Cada entrada del historial incluye `reasonCategory` y `priceVariation`
- [ ] La UI muestra tendencia visual (flecha + %) junto a cada cambio
- [ ] El historial existente (sin categoría) sigue mostrándose correctamente
- [ ] Test: cambiar precio → motivo aparece en historial → API pública también lo devuelve

---

### TICKET PV-03 — Automatización: Cálculo de margen estimado y detección de mínimo

**Tipo:** Backend + Frontend
**Prioridad:** Crítica
**Dependencias:** PV-01

#### Contexto

Actualmente el margen se calcula **solo en el frontend** (`VehicleDetail.tsx`) como `salePrice - (purchasePrice + costes taller + costes asociados)`. Pero no se persiste, no alimenta alertas, y no existe concepto de "precio mínimo" en el vehículo. La vista CouchDB `margin_by_user` solo usa `salePrice - purchasePrice` (sin costes de preparación).

Para un control comercial real, el gerente necesita:
- Ver el margen estimado considerando **todos los costes**
- Configurar un **precio mínimo** por vehículo (o global)
- Recibir **alerta inmediata** si alguien pone un precio por debajo del mínimo

#### Qué hacer

**1. Calcular y persistir margen al guardar vehículo**

En `vehicleController.js`, justo antes de persistir con `buildVehicleDocument`, calcular:

```javascript
const purchasePrice = Number(vehicle.purchasePrice || existingVehicle?.purchasePrice || 0);
const salePrice = Number(vehicle.salePrice || existingVehicle?.salePrice || 0);

const workshopCosts = (Array.isArray(vehicle.workshopRepairs) ? vehicle.workshopRepairs : existingVehicle?.workshopRepairs || [])
  .reduce((sum, r) => sum + Number(r.cost || 0), 0);

const associatedCosts = (Array.isArray(vehicle.associatedCosts) ? vehicle.associatedCosts : existingVehicle?.associatedCosts || [])
  .reduce((sum, c) => sum + Number(c.amount || 0), 0);

const totalPreparationCost = workshopCosts + associatedCosts;
const totalInvestment = purchasePrice + totalPreparationCost;
const estimatedMargin = salePrice > 0 ? salePrice - totalInvestment : null;
const marginPercentage = totalInvestment > 0 && salePrice > 0
  ? ((estimatedMargin / totalInvestment) * 100).toFixed(1)
  : null;
```

Persistir `totalPreparationCost`, `estimatedMargin` y `marginPercentage` en el documento.

**2. Detección de precio por debajo del mínimo**

En `vehicleController.js`, al actualizar un vehículo:

```javascript
const minimumSalePrice = Number(vehicle.minimumSalePrice || existingVehicle?.minimumSalePrice || 0);

if (minimumSalePrice > 0 && salePrice > 0 && salePrice < minimumSalePrice) {
  // Si el usuario NO es gerente, bloquear el guardado
  if (!userIsManager) {
    return res.status(403).json({
      error: `El precio de venta (${salePrice} €) está por debajo del mínimo configurado (${minimumSalePrice} €). Solo un gerente puede autorizar este precio.`,
      code: 'PRICE_BELOW_MINIMUM',
    });
  }
  // Si es gerente, permitir pero emitir alerta
  // (la alerta se genera en PV-06)
}
```

**3. Precio mínimo sugerido automático**

Calcular automáticamente un precio mínimo sugerido basado en la inversión total:

```javascript
const defaultMinMarginPercent = account?.vehicleConfig?.defaultMinMarginPercent || 10;
const suggestedMinimumPrice = Math.ceil(totalInvestment * (1 + defaultMinMarginPercent / 100));
```

Este valor se muestra como sugerencia en la UI; el gerente puede aceptarlo o poner otro distinto.

**4. Configuración global de márgenes**

Añadir a la cuenta (`account`) un bloque de configuración:

```javascript
vehicleConfig: {
  defaultMinMarginPercent: 10,      // Margen mínimo por defecto (%)
  warnMarginPercent: 15,            // Por debajo de este % se muestra warning amarillo
  blockPriceBelowMinimum: true,     // Si true, bloquea a no-gerentes; si false, solo avisa
  autoCalculateMinimum: true,       // Si true, sugiere mínimo basado en inversión + margen
}
```

**5. Actualizar vista CouchDB `margin_by_user`**

Modificar para incluir costes de preparación en el cálculo del margen:

```javascript
emit([doc.user_id], {
  margin: (doc.salePrice || 0) - (doc.purchasePrice || 0) - (doc.totalPreparationCost || 0),
  salePrice: doc.salePrice,
  purchasePrice: doc.purchasePrice,
  preparationCost: doc.totalPreparationCost || 0,
});
```

**6. UI de margen en la ficha del vehículo**

En `VehicleDetail.tsx`, reemplazar el cálculo local por el dato persistido y mejorar la visualización:

```
┌──────────────────────────────────────────────────────────────┐
│  💰 Análisis de margen                                        │
│                                                                │
│  Precio compra:           12.000 €                            │
│  + Costes preparación:     1.800 €  (taller 1.200 + otros 600)│
│  = Inversión total:       13.800 €                            │
│  ─────────────────────────────────                            │
│  Precio venta:            16.500 €                            │
│  Margen estimado:          2.700 €  (19.6%)  🟢              │
│                                                                │
│  Precio mínimo:           15.180 €  (margen 10%)             │
│  ⚠ Si vendes por debajo de 15.180 €, no cubres el mínimo     │
└──────────────────────────────────────────────────────────────┘
```

Semáforo de color:
- 🟢 Verde: margen ≥ `warnMarginPercent`
- 🟡 Amarillo: margen entre 0% y `warnMarginPercent`
- 🔴 Rojo: margen negativo o precio < mínimo

#### Criterios de aceptación

- [ ] Al guardar un vehículo, se calculan y persisten `totalPreparationCost`, `estimatedMargin`, `marginPercentage`
- [ ] El precio mínimo se configura por vehículo (`minimumSalePrice`)
- [ ] Se sugiere precio mínimo automático basado en inversión + margen %
- [ ] Si un trabajador pone precio por debajo del mínimo, el guardado se bloquea (configurable)
- [ ] Si un gerente pone precio por debajo del mínimo, se permite pero se genera alerta
- [ ] La vista CouchDB `margin_by_user` incluye costes de preparación
- [ ] La UI muestra el análisis de margen completo con semáforo
- [ ] Configuración global en cuenta: `defaultMinMarginPercent`, `warnMarginPercent`, `blockPriceBelowMinimum`
- [ ] Retrocompatible: vehículos sin `totalPreparationCost` se calculan con 0

---

### TICKET PV-04 — Automatización: Transiciones de estado comercial

**Tipo:** Backend + Frontend
**Prioridad:** Crítica
**Dependencias:** PV-01, PV-03

#### Contexto

Actualmente solo existe `status` de inventario (`available`, `reserved`, `sold`, `workshop`, `scrapped`) que mezcla lo operativo con lo comercial. No hay un flujo definido para mover un vehículo desde que llega al stock hasta que se vende, con validaciones en cada paso. Esto hace imposible saber, por ejemplo, cuántos coches están "listos para vender" vs "en preparación".

El nuevo `commercialStatus` (PV-01) necesita lógica de transiciones, validaciones y automatizaciones.

#### Qué hacer

**1. Definir transiciones válidas**

```
preparation ──→ ready ──→ published ──→ reserved ──→ sold
     ↑             │          │            │
     └─────────────┘          │            │
     (volver a preparar)      ↓            ↓
                           ready        published
                       (despublicar)  (liberar reserva)
```

Tabla de transiciones:

| Desde | Hacia | Validaciones | Acción automática |
|---|---|---|---|
| `preparation` | `ready` | Debe tener `salePrice > 0`, al menos 1 foto, `commercialDescription` no vacía | Calcular margen si no está calculado |
| `ready` | `published` | Debe tener al menos 1 canal de publicación activo | Marcar `published: true`, registrar `publishedAt` |
| `ready` | `preparation` | Ninguna | — |
| `published` | `reserved` | Ninguna | Despublicar de canales opcionalmente (configurable) |
| `published` | `ready` | Ninguna | Marcar `published: false`, desactivar canales |
| `reserved` | `sold` | Debe existir una operación de venta (`sale`) vinculada o crearse | Marcar `status` inventario = `sold`, registrar `soldAt` |
| `reserved` | `published` | Ninguna (liberar reserva) | Marcar `published: true` de nuevo |
| `sold` | — | Estado final, no se puede revertir desde aquí (solo manualmente por gerente) | — |

**2. Endpoint de transición de estado comercial**

Crear endpoint dedicado en `vehicleController.js`:

```
PUT /api/vehicles/:userId/:vehicleId/commercial-status
Body: { newStatus: string, reason: string }
```

Lógica:
1. Cargar vehículo existente
2. Validar que la transición es permitida (tabla anterior)
3. Ejecutar validaciones específicas del estado destino
4. Registrar en `commercialStatusHistory`
5. Ejecutar acciones automáticas
6. Persistir el documento actualizado

**3. Validaciones del estado `ready` (listo para vender)**

Al intentar pasar a `ready`, verificar:

```javascript
const errors = [];
if (!vehicle.salePrice || vehicle.salePrice <= 0) {
  errors.push('El vehículo debe tener un precio de venta.');
}
if (!vehicle.images?.length) {
  errors.push('El vehículo debe tener al menos una foto.');
}
if (!vehicle.commercialDescription?.trim()) {
  errors.push('El vehículo debe tener una descripción comercial.');
}
if (vehicle.minimumSalePrice && vehicle.salePrice < vehicle.minimumSalePrice) {
  errors.push(`El precio de venta (${vehicle.salePrice} €) está por debajo del mínimo (${vehicle.minimumSalePrice} €).`);
}
if (errors.length) {
  return res.status(400).json({ error: 'No se puede marcar como listo para vender.', details: errors });
}
```

**4. Sincronización `commercialStatus` ↔ `status` (inventario)**

Mantener coherencia entre ambos estados:

| `commercialStatus` cambia a | `status` (inventario) se actualiza a |
|---|---|
| `preparation` | `workshop` (si estaba en taller) o se mantiene |
| `ready` | `available` |
| `published` | `available` |
| `reserved` | `reserved` |
| `sold` | `sold` |

**5. UI: Pipeline visual de estado comercial**

En la página de publicación y venta (PV-08), mostrar un pipeline horizontal:

```
  ● Preparación  ──→  ● Listo  ──→  ● Publicado  ──→  ● Reservado  ──→  ● Vendido
       ✓                 ✓              [ACTUAL]
```

- Estado actual resaltado
- Estados completados con check
- Botón "Siguiente paso" con las validaciones necesarias
- Botón "Retroceder" para estados que lo permiten
- Al hacer clic en un paso futuro, si no cumple validaciones, mostrar lista de requisitos pendientes

**6. Widget de requisitos pendientes**

```
┌──────────────────────────────────────────┐
│  📋 Requisitos para "Listo para vender"   │
│                                            │
│  ✅ Precio de venta definido (16.500 €)   │
│  ✅ Fotos subidas (8 fotos)               │
│  ❌ Descripción comercial                 │
│  ✅ Margen positivo (19.6%)               │
│                                            │
│  [Completar descripción →]                │
└──────────────────────────────────────────┘
```

#### Criterios de aceptación

- [ ] Endpoint `PUT /commercial-status` con validación de transiciones
- [ ] Transiciones válidas según tabla definida
- [ ] Validaciones específicas al pasar a `ready`: precio, fotos, descripción
- [ ] `commercialStatusHistory` registra cada transición con fecha, usuario y motivo
- [ ] Sincronización automática `commercialStatus` → `status` (inventario)
- [ ] Pipeline visual en la UI con estados, checks y botones de acción
- [ ] Widget de requisitos pendientes con links directos para completar
- [ ] Un gerente puede forzar cualquier transición saltando validaciones
- [ ] Un trabajador solo puede avanzar si cumple validaciones

---

### TICKET PV-05 — Gestión de canales de publicación

**Tipo:** Backend + Frontend
**Prioridad:** Alta
**Dependencias:** PV-01, PV-04

#### Contexto

La pestaña "Publicar" actual en `VehicleDetail.tsx` (`PortalPublishSection`) genera **plantillas de texto** para Coches.net, Milanuncios y Wallapop que el usuario copia manualmente. No hay ningún registro de en qué portales está publicado un vehículo, ni cuándo se publicó, ni URLs de los anuncios. Esto impide saber si un vehículo está realmente visible para compradores y en qué plataformas.

#### Qué hacer

**1. Catálogo de canales predefinidos**

Crear constante en backend/frontend con los canales disponibles:

```typescript
const PUBLICATION_CHANNELS = [
  { id: 'coches_net', name: 'Coches.net', icon: '🚗', color: '#0066CC', hasTemplateGenerator: true },
  { id: 'milanuncios', name: 'Milanuncios', icon: '📢', color: '#FF6600', hasTemplateGenerator: true },
  { id: 'wallapop', name: 'Wallapop', icon: '🔄', color: '#13C1AC', hasTemplateGenerator: true },
  { id: 'autocasion', name: 'Autocasión', icon: '🏷️', color: '#003366', hasTemplateGenerator: false },
  { id: 'facebook', name: 'Facebook Marketplace', icon: '📘', color: '#1877F2', hasTemplateGenerator: false },
  { id: 'instagram', name: 'Instagram', icon: '📸', color: '#E4405F', hasTemplateGenerator: false },
  { id: 'web_propia', name: 'Web propia', icon: '🌐', color: '#10B981', hasTemplateGenerator: false },
  { id: 'otro', name: 'Otro canal', icon: '📌', color: '#6B7280', hasTemplateGenerator: false },
];
```

**2. UI: Panel de gestión de canales**

Reemplazar el `PortalPublishSection` actual por un panel completo:

```
┌──────────────────────────────────────────────────────────────┐
│  📡 Canales de publicación                                    │
│                                                                │
│  ┌─────────────┬────────────┬──────────┬───────────┬────────┐│
│  │ Canal       │ Estado     │ Desde    │ URL       │ Acción ││
│  ├─────────────┼────────────┼──────────┼───────────┼────────┤│
│  │ 🚗 Coches   │ 🟢 Activo  │ 12/03/26 │ [Abrir →] │ [Ret.] ││
│  │ 📢 Milanu.  │ 🟢 Activo  │ 12/03/26 │ [Abrir →] │ [Ret.] ││
│  │ 🔄 Wallap.  │ ⚪ No pub.  │ —        │ —         │ [Pub.] ││
│  │ 📘 Facebook │ 🔴 Retirado│ 01/02/26 │ —         │ [Rep.] ││
│  └─────────────┴────────────┴──────────┴───────────┴────────┘│
│                                                                │
│  [+ Añadir canal]   [Publicar en todos]   [Retirar de todos] │
└──────────────────────────────────────────────────────────────┘
```

**3. Flujo de "Publicar en canal"**

Al pulsar "Publicar" en un canal:

1. Modal con:
   - Texto del anuncio pre-generado (reutilizar las plantillas existentes de `PortalPublishSection` para los canales que las tienen)
   - Botón "Copiar texto" (mantener funcionalidad actual)
   - Campo URL del anuncio (para pegar el enlace una vez publicado en el portal)
   - Botón "Marcar como publicado"
2. Al confirmar:
   - Añadir entrada a `publicationChannels[]` con `active: true` y `publishedAt`
   - Si el `commercialStatus` era `ready`, preguntar si pasar a `published`

**4. Flujo de "Retirar de canal"**

Al pulsar "Retirar":
1. Confirmar: "¿Retirar el anuncio de {canal}?"
2. Marcar la entrada con `active: false` y `unpublishedAt`
3. Si no quedan canales activos y `commercialStatus` era `published`, avisar: "No quedan canales activos. ¿Volver a estado Listo?"

**5. Generador de texto mejorado**

Mejorar las plantillas existentes para usar la nueva `commercialDescription` además de los datos técnicos:

```
🚗 {brand} {model} {version} — {year}
📍 {location}

{commercialDescription}

📋 Ficha técnica:
• Combustible: {fuelType}
• Kilómetros: {mileage} km
• Transmisión: {transmission}
• Potencia: {power} CV
• Color: {color}

💰 Precio: {salePrice} €

📞 Contacta con nosotros
{businessName} — {businessPhone}
```

**6. Contadores de publicación en listado de vehículos**

En la tabla/listado general de vehículos (`VehiclesPage.tsx`), añadir columna o badge:
- Número de canales activos (ej: "3 canales")
- Icono por canal (los iconos de los canales activos)

#### Criterios de aceptación

- [ ] Panel de canales muestra estado de publicación por canal
- [ ] Se puede marcar como publicado con URL del anuncio
- [ ] Se puede retirar un anuncio de un canal
- [ ] Generador de texto usa `commercialDescription` + datos técnicos
- [ ] El historial de publicación/retirada queda registrado (`publishedAt`, `unpublishedAt`)
- [ ] Al publicar en primer canal, se ofrece pasar a `commercialStatus: 'published'`
- [ ] Al retirar del último canal, se ofrece volver a `commercialStatus: 'ready'`
- [ ] Listado de vehículos muestra contadores de canales activos
- [ ] Botón "Copiar texto" sigue funcionando como antes (no romper flujo existente)

---

### TICKET PV-06 — Sistema de alertas de publicación y venta

**Tipo:** Backend
**Prioridad:** Alta
**Dependencias:** PV-01, PV-03, PV-04

#### Contexto

El `alertEngine.js` actual tiene `vehicle_stock_aging` (vehículos mucho tiempo en stock) y `low_sales_velocity`, pero faltan 3 alertas críticas para el módulo de publicación y venta: vehículo listo sin publicar, precio por debajo del mínimo, y anuncio sin fotos. Además, la alerta de stock aging debe adaptarse al nuevo `commercialStatus`.

#### Qué hacer

**1. Nueva alerta: Vehículo listo sin publicar**

```javascript
async function checkReadyNotPublished(userId, vehicles, config) {
  if (!config.readyNotPublishedEnabled) return [];
  const alerts = [];
  const thresholdDays = Number(config.readyNotPublishedDays || 3);
  const now = new Date();

  for (const v of vehicles) {
    if (v.active === false) continue;
    if (v.commercialStatus !== 'ready') continue;
    if (v.published) continue;

    // Buscar cuándo pasó a "ready" en el historial
    const readyEntry = [...(v.commercialStatusHistory || [])].reverse()
      .find(h => h.toStatus === 'ready');
    if (!readyEntry) continue;

    const daysReady = daysBetween(readyEntry.date, now);
    if (daysReady < thresholdDays) continue;

    alerts.push(await emitAlert({
      userId,
      dedupKey: `readynotpub-${v._id}`,
      level: daysReady > 7 ? 'alert' : 'warning',
      category: 'vehicle_ready_not_published',
      title: 'Vehículo listo sin publicar',
      message: `${v.brand} ${v.model} (${v.registrationPlate}) lleva ${daysReady} días listo para vender pero no está publicado en ningún canal.`,
      entityId: v._id,
      entityType: 'car',
      route: `/saas/vehicles/${v._id}`,
      metadata: {
        plate: v.registrationPlate,
        brand: v.brand,
        model: v.model,
        daysReady,
        salePrice: v.salePrice,
      },
    }));
  }
  return alerts.filter(Boolean);
}
```

**2. Nueva alerta: Precio por debajo del mínimo**

```javascript
async function checkPriceBelowMinimum(userId, vehicles, config) {
  if (!config.priceBelowMinEnabled) return [];
  const alerts = [];

  for (const v of vehicles) {
    if (v.active === false) continue;
    if (!v.minimumSalePrice || v.minimumSalePrice <= 0) continue;
    if (!v.salePrice || v.salePrice <= 0) continue;
    if (v.salePrice >= v.minimumSalePrice) continue;
    if (v.commercialStatus === 'sold') continue;

    const diff = v.minimumSalePrice - v.salePrice;
    const pct = ((diff / v.minimumSalePrice) * 100).toFixed(1);

    alerts.push(await emitAlert({
      userId,
      dedupKey: `pricebelowmin-${v._id}`,
      level: 'alert',
      category: 'vehicle_price_below_minimum',
      title: 'Precio por debajo del mínimo',
      message: `${v.brand} ${v.model} (${v.registrationPlate}) tiene un precio de venta de ${v.salePrice} €, que está ${diff} € (${pct}%) por debajo del mínimo configurado (${v.minimumSalePrice} €).`,
      entityId: v._id,
      entityType: 'car',
      route: `/saas/vehicles/${v._id}`,
      metadata: {
        plate: v.registrationPlate,
        salePrice: v.salePrice,
        minimumSalePrice: v.minimumSalePrice,
        diff,
        pct: Number(pct),
      },
    }));
  }
  return alerts.filter(Boolean);
}
```

**3. Nueva alerta: Anuncio sin fotos**

```javascript
async function checkPublishedWithoutPhotos(userId, vehicles, config) {
  if (!config.noPhotosEnabled) return [];
  const alerts = [];

  for (const v of vehicles) {
    if (v.active === false) continue;
    if (v.commercialStatus === 'sold' || v.commercialStatus === 'preparation') continue;

    const hasPhotos = Array.isArray(v.images) && v.images.length > 0;
    if (hasPhotos) continue;

    // Solo alertar si el vehículo está publicado o listo
    if (v.commercialStatus === 'published' || v.commercialStatus === 'ready') {
      alerts.push(await emitAlert({
        userId,
        dedupKey: `nophotos-${v._id}`,
        level: v.published ? 'alert' : 'warning',
        category: 'vehicle_no_photos',
        title: v.published ? 'Anuncio publicado sin fotos' : 'Vehículo listo sin fotos',
        message: `${v.brand} ${v.model} (${v.registrationPlate}) ${v.published ? 'está publicado' : 'está listo para vender'} pero no tiene ninguna foto. Los anuncios sin fotos tienen mucha menos visibilidad.`,
        entityId: v._id,
        entityType: 'car',
        route: `/saas/vehicles/${v._id}`,
        metadata: {
          plate: v.registrationPlate,
          published: v.published,
          commercialStatus: v.commercialStatus,
        },
      }));
    }
  }
  return alerts.filter(Boolean);
}
```

**4. Mejorar alerta existente `vehicle_stock_aging`**

Adaptar para usar `commercialStatus`:

- Si `commercialStatus === 'preparation'`: umbral más corto (ej: `preparationAlertDays || 15`) — "lleva X días en preparación"
- Si `commercialStatus === 'published'`: usar el umbral existente `vehicleStockAlertDays` — "lleva X días publicado sin venderse"
- Si `commercialStatus === 'ready'` + `published === false`: ya cubierto por alerta "listo sin publicar"

**5. Configuración de alertas**

Ampliar `getAlertConfig()` en `alertEngine.js`:

```javascript
readyNotPublishedEnabled: cfg.readyNotPublishedEnabled !== false,
readyNotPublishedDays: Number(cfg.readyNotPublishedDays || 3),
priceBelowMinEnabled: cfg.priceBelowMinEnabled !== false,
noPhotosEnabled: cfg.noPhotosEnabled !== false,
preparationAlertEnabled: cfg.preparationAlertEnabled !== false,
preparationAlertDays: Number(cfg.preparationAlertDays || 15),
```

**6. Integrar en `runAlertsForUser()`**

Añadir las 3 nuevas funciones al ciclo de alertas. Los vehículos ya se cargan en el motor existente, solo hace falta llamar a las nuevas funciones con el mismo array.

**7. Resumen de alertas en endpoint**

Ampliar `getAlertSummary` con:

```javascript
vehicleReadyNotPublishedCount: Number,
vehiclePriceBelowMinCount: Number,
vehicleNoPhotosCount: Number,
```

#### Criterios de aceptación

- [ ] Alerta `vehicle_ready_not_published`: se genera si un vehículo lleva X días en `ready` sin publicar
- [ ] Alerta `vehicle_price_below_minimum`: se genera si `salePrice < minimumSalePrice`
- [ ] Alerta `vehicle_no_photos`: se genera si un vehículo publicado o listo no tiene fotos
- [ ] Alerta `vehicle_stock_aging` mejorada: distingue preparación vs publicado
- [ ] Configuración por cuenta para activar/desactivar cada alerta y ajustar umbrales
- [ ] Las alertas se envían por SSE + Push como las existentes
- [ ] Las alertas apuntan a la ruta del vehículo (`/saas/vehicles/:id`)
- [ ] Deduplicación correcta (una alerta por vehículo por día como máximo)
- [ ] Resumen de alertas incluye los nuevos contadores

---

### TICKET PV-07 — Comercial asignado y perfiles de acceso

**Tipo:** Backend + Frontend
**Prioridad:** Alta
**Dependencias:** PV-01

#### Contexto

Actualmente no hay concepto de "comercial asignado" a un vehículo. El campo `responsible` solo existe en la operación de venta (`sale`), no en el vehículo. Además, el permiso `vehicles` es binario: o tienes acceso o no. No hay diferenciación entre gerente (controla precios, márgenes, publicación) y trabajador (prepara ficha comercial, propone cambios).

#### Qué hacer

**1. Asignación de comercial al vehículo**

Los campos `assignedCommercialId` y `assignedCommercialName` se añadieron en PV-01. Implementar:

En `vehicleController.js`:
- Al asignar comercial, validar que el `assignedCommercialId` es un miembro activo del equipo
- Registrar la asignación en `commercialStatusHistory` como evento: `{ type: 'commercial_assigned', ... }`

En la UI:
- Dropdown de miembros del equipo con permiso `vehicles`
- Avatar + nombre del comercial asignado visible en la ficha y en el listado

**2. Definir sub-permisos de vehículos**

Ampliar `TEAM_PERMISSION_KEYS` o crear una estructura de sub-permisos dentro de `vehicles`:

```javascript
vehiclePermissions: {
  canViewVehicles: true,           // Ver listado y fichas
  canEditBasicInfo: true,          // Editar datos técnicos (marca, modelo, km, etc.)
  canEditCommercialInfo: true,     // Editar descripción comercial, fotos
  canEditPrices: false,            // Editar precio de venta (solo gerente por defecto)
  canSetMinimumPrice: false,       // Configurar precio mínimo (solo gerente)
  canPublish: false,               // Publicar/despublicar en canales (solo gerente)
  canChangeCommercialStatus: false,// Cambiar estado comercial (solo gerente)
  canAssignCommercial: false,      // Asignar comercial a vehículo (solo gerente)
  canSeeMargins: false,            // Ver márgenes y precio de compra (solo gerente)
}
```

Presets por perfil:

| Permiso | Gerente | Trabajador |
|---|---|---|
| `canViewVehicles` | ✅ | ✅ |
| `canEditBasicInfo` | ✅ | ✅ |
| `canEditCommercialInfo` | ✅ | ✅ |
| `canEditPrices` | ✅ | ❌ |
| `canSetMinimumPrice` | ✅ | ❌ |
| `canPublish` | ✅ | ❌ |
| `canChangeCommercialStatus` | ✅ | ⚡ (solo ciertos) |
| `canAssignCommercial` | ✅ | ❌ |
| `canSeeMargins` | ✅ | ❌ |

**3. Lógica de "proponer cambios" para trabajador**

Si un trabajador sin permiso `canEditPrices` intenta cambiar el precio:

Opción A (simple): El campo está deshabilitado con tooltip "Solo un gerente puede modificar el precio".

Opción B (con propuesta): El trabajador puede rellenar un "precio sugerido" que genera una notificación al gerente asignado para que lo apruebe.

Implementar opción A como base; opción B como mejora futura (no bloquear este ticket por ello).

**4. Validación en backend**

En `vehicleController.js`, antes de aplicar cambios:

```javascript
const teamMember = await getTeamMember(userId, req.teamMemberId);
const perms = teamMember?.vehiclePermissions || getDefaultPermissions(teamMember?.role);

if (priceChanged && !perms.canEditPrices) {
  return res.status(403).json({
    error: 'No tienes permiso para modificar el precio de venta.',
    code: 'INSUFFICIENT_VEHICLE_PERMISSIONS',
  });
}

if (minimumPriceChanged && !perms.canSetMinimumPrice) {
  return res.status(403).json({
    error: 'No tienes permiso para configurar el precio mínimo.',
    code: 'INSUFFICIENT_VEHICLE_PERMISSIONS',
  });
}

if (commercialStatusChanged && !perms.canChangeCommercialStatus) {
  return res.status(403).json({
    error: 'No tienes permiso para cambiar el estado comercial.',
    code: 'INSUFFICIENT_VEHICLE_PERMISSIONS',
  });
}
```

**5. UI: Ocultar/deshabilitar según permisos**

En `VehicleDetail.tsx` y en la nueva página de publicación (PV-08):
- Si `!canSeeMargins`: ocultar bloque de márgenes, precio de compra, costes
- Si `!canEditPrices`: campo precio de venta en solo lectura
- Si `!canPublish`: botones de publicar/despublicar deshabilitados
- Si `!canChangeCommercialStatus`: pipeline de estado sin botones de acción
- Mostrar avatar + nombre del comercial asignado a cada vehículo

**6. Filtro "Mis vehículos" para comerciales**

En el listado de vehículos, añadir filtro rápido:
- "Todos los vehículos" (gerente)
- "Mis vehículos" (solo los asignados al comercial actual)
- "Sin asignar"

#### Criterios de aceptación

- [ ] Se puede asignar un comercial a cada vehículo (dropdown de miembros del equipo)
- [ ] Sub-permisos de vehículos definidos y configurables por miembro del equipo
- [ ] Gerente tiene acceso completo (precios, márgenes, publicación, estado comercial)
- [ ] Trabajador puede editar datos básicos y descripción comercial pero NO precios ni publicación
- [ ] Backend valida permisos antes de aplicar cambios sensibles
- [ ] UI oculta/deshabilita secciones según permisos del usuario actual
- [ ] Filtro "Mis vehículos" funcional en el listado
- [ ] Si `canSeeMargins: false`, no se muestran precios de compra ni márgenes

---

### TICKET PV-08 — Página frontend: Publicación y venta

**Tipo:** Frontend
**Prioridad:** Crítica
**Dependencias:** PV-01, PV-02, PV-03, PV-04, PV-05, PV-06, PV-07

#### Contexto

No existe una página dedicada a la gestión comercial de vehículos. La información está dispersa entre `VehicleDetail.tsx` (pestaña "Publicar" con plantillas, pestaña "Finanzas" con historial de precios) y no hay una vista centralizada donde un gerente pueda ver el estado comercial de todo su inventario y un trabajador pueda preparar fichas comerciales.

#### Qué hacer

**1. Crear `src/app/pages/saas/PublicacionVentaPage.tsx`**

Página con dos vistas principales: **Listado comercial** y **Ficha comercial** (detalle de un vehículo).

**2. Vista: Listado comercial (vista por defecto)**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Publicación y venta                                               [+ Nuevo]│
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📊 KPIs superiores                                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│  │ Total   │ │En prepa-│ │Listos   │ │Publi-   │ │Reser-   │ │Vendidos │ │
│  │ stock   │ │ración   │ │vender   │ │cados    │ │vados    │ │ mes     │ │
│  │ 24      │ │ 5       │ │ 3       │ │ 12      │ │ 2       │ │ 4       │ │
│  │         │ │ ⚠ 2>15d │ │ ⚠ 1s/p  │ │ ✓       │ │         │ │+25% vs  │ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │ant.     │ │
│                                                                 └─────────┘ │
│  Filtros: [Estado ▾] [Comercial ▾] [Publicado ▾] [Precio ▾] [Buscar...]    │
│  Vista: [▦ Tabla] [▤ Tarjetas] [═ Pipeline]                                │
│                                                                              │
│  ═══ Vista Pipeline (Kanban) ═══                                            │
│                                                                              │
│  │ Preparación (5)  │ Listo (3)     │ Publicado (12) │ Reservado (2)│ Vend.│
│  ├──────────────────┼───────────────┼────────────────┼──────────────┼──────┤
│  │ ┌──────────┐     │ ┌───────────┐ │ ┌────────────┐ │ ┌──────────┐│      │
│  │ │ BMW 320d │     │ │ Audi A4   │ │ │ VW Golf    │ │ │ Seat León││      │
│  │ │ 2022     │     │ │ 2023      │ │ │ 2021       │ │ │ 2023     ││      │
│  │ │ 16.500€  │     │ │ 22.000€   │ │ │ 14.900€    │ │ │ 19.500€  ││      │
│  │ │ 📸 8     │     │ │ 📸 12     │ │ │ 📸 10      │ │ │ Juan P.  ││      │
│  │ │ J. Pérez │     │ │ M. López  │ │ │ 3 canales  │ │ │ Cliente: ││      │
│  │ │ 12 días  │     │ │ Margen 18%│ │ │ 45 días    │ │ │ A. Ruiz  ││      │
│  │ │ ⚠ Sin fot│     │ │           │ │ │ Margen 15% │ │ └──────────┘│      │
│  │ └──────────┘     │ └───────────┘ │ └────────────┘ │              │      │
│  │ ┌──────────┐     │               │ ┌────────────┐ │              │      │
│  │ │ Renault  │     │               │ │ Peugeot    │ │              │      │
│  │ │ Clio     │     │               │ │ 308        │ │              │      │
│  │ └──────────┘     │               │ └────────────┘ │              │      │
│  └──────────────────┴───────────────┴────────────────┴──────────────┴──────┘
│                                                                              │
│  ═══ Vista Tabla ═══                                                        │
│                                                                              │
│  │ Vehículo      │ Precio   │ Margen │ Estado     │ Canales │ Comercial│Días│
│  ├───────────────┼──────────┼────────┼────────────┼─────────┼──────────┼────┤
│  │ VW Golf 2021  │ 14.900 € │ 15% 🟢│ Publicado  │ 🚗📢🔄  │ J.Pérez │ 45 │
│  │ Audi A4 2023  │ 22.000 € │ 18% 🟢│ Listo      │ —       │ M.López │ 12 │
│  │ BMW 320d 2022 │ 16.500 € │  5% 🟡│ Preparación│ —       │ J.Pérez │ 30 │
│  │ Seat León 2023│ 19.500 € │ 22% 🟢│ Reservado  │ 🚗📢    │ J.Pérez │ 60 │
└──────────────────────────────────────────────────────────────────────────────┘
```

**3. Vista: Ficha comercial (detalle)**

Al hacer clic en un vehículo, se abre su ficha comercial completa:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Volver                                        BMW 320d 2022  · 1234 ABC │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Pipeline de estado ──                                                   │
│  ● Preparación ──→ ● Listo ──→ ○ Publicado ──→ ○ Reservado ──→ ○ Vendido  │
│                     [ACTUAL]                                                 │
│  📋 Para publicar: falta descripción comercial, elegir canales              │
│  [Pasar a Publicado →]                                                      │
│                                                                              │
├───────────────────────────────┬──────────────────────────────────────────────┤
│                               │                                              │
│  📸 Galería de fotos          │  📝 Descripción comercial                    │
│  ┌────┬────┬────┬────┐       │  ┌──────────────────────────────────────────┐│
│  │    │    │    │    │       │  │ Precioso BMW 320d del 2022 con solo     ││
│  │ 1  │ 2  │ 3  │ 4  │       │  │ 45.000 km. Acabado M Sport, navegación ││
│  │    │    │    │    │       │  │ profesional, asientos calefactados...   ││
│  └────┴────┴────┴────┘       │  │                                          ││
│  8 fotos  [Añadir] [Ordenar] │  │ [✏️ Editar]                              ││
│                               │  └──────────────────────────────────────────┘│
│  💰 Precios y margen          │                                              │
│  ┌────────────────────────┐  │  📡 Canales de publicación                   │
│  │ Compra:     12.000 €   │  │  ┌──────────────────────────────────────────┐│
│  │ Preparación: 1.800 €   │  │  │ 🚗 Coches.net     🟢 Activo  12/03/26  ││
│  │ Inversión:  13.800 €   │  │  │ 📢 Milanuncios    🟢 Activo  12/03/26  ││
│  │ ─────────────────────  │  │  │ 🔄 Wallapop       ⚪ No pub.           ││
│  │ Venta:      16.500 €   │  │  │                                          ││
│  │ Margen:      2.700 € 🟢│  │  │ [+ Añadir canal]                        ││
│  │ Margen %:      19.6%   │  │  └──────────────────────────────────────────┘│
│  │                        │  │                                              │
│  │ Mínimo:     15.180 €   │  │  👤 Comercial asignado                      │
│  │ ✅ Precio OK            │  │  ┌──────────────────────────────────────────┐│
│  └────────────────────────┘  │  │ Juan Pérez  [Cambiar ▾]                  ││
│                               │  └──────────────────────────────────────────┘│
│  📈 Historial de precios      │                                              │
│  ┌────────────────────────┐  │  ⭐ Opciones                                 │
│  │ 14/04 16.500€ ↑ +3.1% │  │  ┌──────────────────────────────────────────┐│
│  │   Ajuste de mercado    │  │  │ [✓] Vehículo destacado                   ││
│  │ 02/04 16.000€ ↓ -3.0% │  │  │ [✓] Publicado                            ││
│  │   Tiempo en stock      │  │  │ Días en stock: 45                        ││
│  │ 15/03 16.500€ (inicio) │  │  │ Microsite: vertialapp.com/v/abc123 [Copiar]││
│  │                        │  │  └──────────────────────────────────────────┘│
│  │ [Ver historial completo]│  │                                              │
│  └────────────────────────┘  │                                              │
│                               │                                              │
├───────────────────────────────┴──────────────────────────────────────────────┤
│  Notas internas (no visibles para clientes)                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │ El cliente anterior preguntó por financiación. Pendiente de confirmar   ││
│  │ con el banco condiciones para este modelo.                               ││
│  └──────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

**4. Registrar ruta en `routes.tsx`**

```typescript
{
  path: 'vertical/compraventa/publicacion-venta',
  component: PublicacionVentaPage,
}
```

**5. Añadir entrada en `Sidebar.tsx`**

En el grupo del vertical compraventa:
- Icono: `Tag` o `Megaphone`
- Label: "Publicación y venta"
- Ruta: `/saas/vertical/compraventa/publicacion-venta`

**6. Adaptar `VehicleDetail.tsx`**

- La pestaña "Publicar" existente debe apuntar a la nueva ficha comercial: al hacer clic, navegar a `/saas/vertical/compraventa/publicacion-venta?vehicleId={id}`
- Mantener un resumen mínimo en el detalle del vehículo (estado comercial + link "Ver ficha comercial completa")

**7. Responsive y dark mode**

- Vista Kanban: scroll horizontal en mobile, columnas colapsables
- Vista tabla: tabla responsive con scroll horizontal
- Todos los componentes compatibles con dark mode del sistema

#### Criterios de aceptación

- [ ] Página accesible en `/saas/vertical/compraventa/publicacion-venta`
- [ ] Vista listado con 3 modos: tabla, tarjetas y pipeline Kanban
- [ ] KPIs superiores: total stock, por estado comercial, vendidos del mes
- [ ] Filtros: estado comercial, comercial asignado, publicado, rango de precio, búsqueda
- [ ] Vista Kanban: arrastrar vehículos entre columnas cambia el estado (con validaciones)
- [ ] Ficha comercial completa: pipeline, fotos, descripción, precios, margen, canales, comercial, historial
- [ ] Sección de precios/margen oculta para perfiles sin `canSeeMargins`
- [ ] Campos de precio en solo lectura para perfiles sin `canEditPrices`
- [ ] Registrada en `routes.tsx` y visible en `Sidebar.tsx`
- [ ] Deep linking: `?vehicleId={id}` abre la ficha del vehículo directamente
- [ ] Responsive: funciona en tablet y móvil
- [ ] Dark mode coherente con el diseño del sistema
- [ ] Skeleton loaders para carga progresiva

---

### TICKET PV-09 — Conexión: Vehículos ↔ Publicación y venta

**Tipo:** Frontend
**Prioridad:** Alta
**Dependencias:** PV-08

#### Contexto

La página de vehículos (`VehiclesPage.tsx` y `VehicleDetail.tsx`) y la nueva página de publicación y venta (PV-08) deben estar conectadas bidireccionalmente. El flujo natural es: el vehículo se compra → se prepara → se publica → se vende. Ambas páginas deben reflejar esta progresión.

#### Qué hacer

**1. Indicador de estado comercial en `VehiclesPage.tsx`**

En la tabla de vehículos existente, añadir columna "Estado comercial":
- Badge de color según `commercialStatus`
- `preparation` → gris "En preparación"
- `ready` → azul "Listo"
- `published` → verde "Publicado"
- `reserved` → naranja "Reservado"
- `sold` → negro "Vendido"

**2. Acciones rápidas en `VehiclesPage.tsx`**

En el menú contextual (tres puntos) de cada vehículo:
- "Ver ficha comercial" → navega a publicación-venta con `?vehicleId={id}`
- "Publicar" → atajo para marcar como publicado (con validaciones)
- "Marcar como vendido" → atajo que abre el flujo de venta

**3. Badge en `VehicleDetail.tsx`**

En el header del detalle del vehículo:
- Badge con `commercialStatus` actual
- Link "Ficha comercial →" que navega a la nueva página
- Mini-resumen: "Publicado en 3 canales · Margen 19.6%"

**4. Sincronización bidireccional**

Cuando se cambia el `commercialStatus` desde la nueva página, la vista de vehículos (`VehiclesPage`) debe reflejar el cambio inmediatamente (vía refresco del estado global o invalidación de caché).

#### Criterios de aceptación

- [ ] Columna "Estado comercial" visible en el listado de vehículos
- [ ] Acciones rápidas de publicación accesibles desde el listado
- [ ] Badge de estado comercial en el detalle del vehículo
- [ ] Link bidireccional entre detalle de vehículo y ficha comercial
- [ ] Los cambios de estado se reflejan inmediatamente en ambas vistas

---

### TICKET PV-10 — Conexión: CRM ↔ Publicación y venta

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Dependencias:** PV-08

#### Contexto

Cuando un lead llega interesado en un vehículo, el comercial necesita ver si el vehículo está publicado, a qué precio y cuál es el margen para negociar. Del lado de publicación, cuando un vehículo se reserva, debería poderse vincular con un lead/cliente del CRM.

#### Qué hacer

**1. Widget de vehículo en ficha de lead (`LeadDetail`)**

Si el lead tiene `vehicleId` vinculado, mostrar:

```
┌───────────────────────────────────────────┐
│  🚗 Vehículo de interés                    │
│                                             │
│  BMW 320d 2022 — 16.500 €                 │
│  Estado: Publicado · 3 canales             │
│  Días en stock: 45                         │
│  Comercial: Juan Pérez                     │
│                                             │
│  [Ver ficha comercial →]                   │
└───────────────────────────────────────────┘
```

**2. Vincular reserva con cliente**

Al pasar un vehículo a `reserved` desde la página de publicación:
- Modal que pide seleccionar un cliente/lead del CRM o crear uno nuevo
- Opcionalmente crear una operación de venta (`sale`) automáticamente
- Vincular: `sale.vehicleId` ↔ `vehicle._id`

**3. Indicador de leads activos en la ficha comercial**

En la ficha comercial del vehículo (PV-08), si hay leads/clientes interesados en ese vehículo:

```
┌───────────────────────────────────────────┐
│  👥 Interesados (3)                        │
│                                             │
│  • Antonio Ruiz — Contactado ayer          │
│  • María Gómez — Visita programada 16/04  │
│  • Pedro Sánchez — Presupuesto enviado     │
│                                             │
│  [Ver en CRM →]                            │
└───────────────────────────────────────────┘
```

**4. Flujo: "Reservar para cliente"**

Desde el CRM, al marcar un lead como `reserved`:
- Actualizar el `commercialStatus` del vehículo a `reserved`
- Registrar en el historial comercial quién reservó y para qué cliente
- Actualizar la operación de venta correspondiente

#### Criterios de aceptación

- [ ] Widget de vehículo visible en ficha de lead/cliente con datos comerciales
- [ ] Al reservar un vehículo, se vincula con un cliente/lead del CRM
- [ ] Indicador de leads interesados visible en la ficha comercial del vehículo
- [ ] Flujo "Reservar para cliente" sincroniza CRM ↔ estado comercial del vehículo
- [ ] Links cruzados funcionales entre ambos módulos

---

### TICKET PV-11 — Conexión: Finanzas ↔ Publicación y venta

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Dependencias:** PV-08, PV-03

#### Contexto

Cuando un vehículo se vende, el margen real debe reflejarse en finanzas. Actualmente la vista CouchDB `margin_by_user` solo calcula `salePrice - purchasePrice` sin costes de preparación. Además, no hay movimiento financiero automático al vender un vehículo.

#### Qué hacer

**1. Al marcar vehículo como `sold`, generar movimiento financiero**

Si la automatización está activa (`account.financeConfig.autoCreateIncomeOnVehicleSale`):

```javascript
const movement = {
  type: 'cobro',
  concept: `Venta vehículo ${vehicle.brand} ${vehicle.model} (${vehicle.registrationPlate})`,
  amountBase: vehicle.salePrice,
  category: 'venta_vehiculo',
  reference: vehicle.registrationPlate,
  linkedEntityId: vehicle._id,
  linkedEntityType: 'car',
  bankAccountId: account.financeConfig?.defaultBankAccountId,
};
```

**2. Informe de márgenes por vehículo**

Nuevo endpoint o ampliación de métricas de ventas:

```
GET /api/sales-metrics/:userId/vehicle-margins?from=2026-01-01&to=2026-04-14
```

Respuesta:

```json
{
  "vehicles": [
    {
      "vehicleId": "car:...",
      "plate": "1234 ABC",
      "brand": "BMW",
      "model": "320d",
      "purchasePrice": 12000,
      "preparationCost": 1800,
      "totalInvestment": 13800,
      "salePrice": 16500,
      "margin": 2700,
      "marginPercent": 19.6,
      "daysInStock": 45,
      "soldAt": "2026-04-10"
    }
  ],
  "totals": {
    "totalInvestment": 55200,
    "totalRevenue": 66000,
    "totalMargin": 10800,
    "avgMarginPercent": 19.6,
    "avgDaysInStock": 38
  }
}
```

**3. Widget de márgenes en la landing de Finanzas**

Si la vertical es concesionario, mostrar en la landing de finanzas (FIN-03):

```
┌───────────────────────────────────────────┐
│  🚗 Márgenes vehículos (mes actual)        │
│                                             │
│  Vendidos: 4                               │
│  Margen medio: 2.700 € (19.6%)            │
│  Mejor: Audi A4 — 4.200 € (22%)          │
│  Peor: Renault Clio — 800 € (8%)          │
│                                             │
│  [Ver informe completo →]                  │
└───────────────────────────────────────────┘
```

#### Criterios de aceptación

- [ ] Al vender un vehículo, se crea movimiento financiero automáticamente (configurable)
- [ ] Endpoint de márgenes por vehículo con costes reales de preparación
- [ ] Widget de márgenes en la landing de finanzas (si vertical concesionario)
- [ ] Los márgenes reflejan la inversión total (compra + preparación)
- [ ] Links cruzados: desde finanzas al vehículo y viceversa

---

### TICKET PV-12 — Conexión: Dashboard ↔ Publicación y venta

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Dependencias:** PV-08

#### Contexto

El Dashboard (`Dashboard.tsx`) tiene KPIs generales pero no refleja el estado comercial del inventario de vehículos. Un gerente que abre el dashboard debería ver de un vistazo cuántos coches tiene publicados, cuántos llevan mucho tiempo sin venderse, y cuál es el margen promedio.

#### Qué hacer

**1. Widget "Inventario comercial" en Dashboard**

```
┌──────────────────────────────────────────────────┐
│  🚗 Inventario comercial                          │
│                                                    │
│  En preparación:  5  (⚠ 2 llevan >15 días)       │
│  Listos:          3  (⚠ 1 sin publicar)           │
│  Publicados:     12                                │
│  Reservados:      2                                │
│  ─────────────────────────────────                │
│  Vendidos este mes: 4  (+25% vs anterior)         │
│  Margen medio: 2.700 € (19.6%)                   │
│  Días medios en stock: 38                          │
│                                                    │
│  ⚠ 3 alertas activas                              │
│  [Ver publicación y venta →]                      │
└──────────────────────────────────────────────────┘
```

**2. Ampliar endpoint `/api/dashboard/kpis/:userId`**

Para la vertical concesionario, añadir:

```javascript
vehicleCommercial: {
  totalStock: 22,
  byCommercialStatus: {
    preparation: 5,
    ready: 3,
    published: 12,
    reserved: 2,
  },
  soldThisMonth: 4,
  soldLastMonth: 3,
  soldChangePercent: 33.3,
  avgMargin: 2700,
  avgMarginPercent: 19.6,
  avgDaysInStock: 38,
  totalStockValue: 264000,
  totalPotentialRevenue: 330000,
  alertsCount: 3,
  alerts: [
    { type: 'vehicle_ready_not_published', count: 1 },
    { type: 'vehicle_no_photos', count: 1 },
    { type: 'vehicle_stock_aging', count: 1 },
  ],
},
```

**3. Mini-gráfico de ventas**

Sparkline dentro del widget: ventas por semana de los últimos 2 meses.

#### Criterios de aceptación

- [ ] Widget "Inventario comercial" visible en Dashboard (solo vertical concesionario)
- [ ] KPIs calculados desde datos reales de vehículos
- [ ] Desglose por `commercialStatus`
- [ ] Alertas comerciales visibles dentro del widget
- [ ] Click navega a `/saas/vertical/compraventa/publicacion-venta`
- [ ] Sparkline de ventas funcional
- [ ] Responsive + dark mode

---

### TICKET PV-13 — Conexión: Documentación ↔ Publicación y venta

**Tipo:** Frontend
**Prioridad:** Baja
**Dependencias:** PV-08

#### Contexto

Los vehículos en proceso de venta generan documentación: fotos profesionales, ficha técnica, contrato de compraventa, informe de historial, etc. El módulo de Documentación (`DocumentsPage.tsx`) existe pero no está vinculado con los vehículos comerciales.

#### Qué hacer

**1. Vincular documentos al vehículo**

En la ficha comercial (PV-08), sección "Documentos":

```
┌───────────────────────────────────────────┐
│  📄 Documentos                              │
│                                             │
│  📋 Ficha técnica (ITV)       [Abrir]      │
│  📷 Fotos profesionales       [Abrir]      │
│  📝 Informe Carfax            [Abrir]      │
│  ❌ Contrato compraventa      [Pendiente]  │
│                                             │
│  [+ Adjuntar documento]                    │
└───────────────────────────────────────────┘
```

**2. Checklist de documentación para venta**

Configurar por cuenta qué documentos son necesarios para vender:

```javascript
vehicleDocumentChecklist: [
  { id: 'ficha_tecnica', label: 'Ficha técnica (ITV)', required: true },
  { id: 'informe_historial', label: 'Informe de historial', required: false },
  { id: 'contrato_compraventa', label: 'Contrato de compraventa', required: true },
  { id: 'fotos_profesionales', label: 'Fotos profesionales', required: true },
  { id: 'permiso_circulacion', label: 'Permiso de circulación', required: true },
]
```

Al pasar a `sold`, verificar que los documentos requeridos están adjuntos.

**3. Desde Documentación, ver vehículo vinculado**

En `DocumentsPage.tsx`, si un documento tiene `linkedEntityType: 'car'`, mostrar link al vehículo.

#### Criterios de aceptación

- [ ] Sección de documentos en la ficha comercial del vehículo
- [ ] Se pueden adjuntar documentos existentes o subir nuevos
- [ ] Checklist configurable de documentación necesaria para vender
- [ ] Validación opcional al marcar como vendido (documentos requeridos)
- [ ] Vinculación bidireccional entre documentos y vehículos

---

## Orden de ejecución recomendado

```
Fase 1 — Cimientos (modelo de datos)
├── PV-01 Campos comerciales del vehículo
└── PV-02 Histórico de precios (completar flujo)

Fase 2 — Automatizaciones core
├── PV-03 Cálculo de margen y detección de mínimo
├── PV-04 Transiciones de estado comercial
└── PV-07 Comercial asignado y perfiles de acceso

Fase 3 — Publicación
├── PV-05 Gestión de canales de publicación
└── PV-06 Sistema de alertas

Fase 4 — Página principal
└── PV-08 Página frontend completa (publicación y venta)

Fase 5 — Integraciones
├── PV-09 Conexión Vehículos ↔ Publicación
├── PV-10 Conexión CRM ↔ Publicación
├── PV-11 Conexión Finanzas ↔ Publicación
├── PV-12 Conexión Dashboard ↔ Publicación
└── PV-13 Conexión Documentación ↔ Publicación
```

## Estimación de esfuerzo

| Ticket | Complejidad | Estimación |
|---|---|---|
| PV-01 Campos comerciales del vehículo | Media | 3-4h |
| PV-02 Histórico de precios (completar flujo) | Media | 3-4h |
| PV-03 Cálculo de margen y detección de mínimo | Alta | 5-6h |
| PV-04 Transiciones de estado comercial | Alta | 6-8h |
| PV-05 Gestión de canales de publicación | Alta | 5-6h |
| PV-06 Sistema de alertas | Media-Alta | 4-5h |
| PV-07 Comercial asignado y perfiles | Alta | 5-6h |
| PV-08 Página frontend completa | Muy Alta | 10-14h |
| PV-09 Conexión Vehículos | Media | 3-4h |
| PV-10 Conexión CRM | Media | 3-4h |
| PV-11 Conexión Finanzas | Media | 4-5h |
| PV-12 Conexión Dashboard | Media | 3-4h |
| PV-13 Conexión Documentación | Baja | 2-3h |
| **Total** | | **~56-73h** |

---

## Notas técnicas

### Base de datos
Todos los campos nuevos se añaden al documento `car` existente en la base de datos de vehículos (`getVehiclesDbName()`). CouchDB no requiere migraciones: los campos nuevos son opcionales con fallback a valores por defecto.

### Retrocompatibilidad
- Vehículos existentes sin `commercialStatus` se tratan como `'preparation'`
- Vehículos existentes sin `published` se tratan como `false`
- Vehículos existentes sin `publicationChannels` se tratan como `[]`
- Las rutas existentes (`/saas/vehicles`, `/saas/vehicles/:id`) no cambian
- La pestaña "Publicar" en `VehicleDetail.tsx` sigue funcionando pero añade link a la nueva página

### Relación `commercialStatus` vs `status` (inventario)
Son campos independientes pero sincronizados:
- `status` refleja el estado físico/operativo del vehículo (taller, disponible, vendido)
- `commercialStatus` refleja el estado en el proceso de venta (preparación, listo, publicado, reservado, vendido)
- Al cambiar `commercialStatus`, se actualiza `status` automáticamente según la tabla de PV-04

### Relación con operación de venta (`sale`)
El vehículo tiene su propio `commercialStatus` que es independiente de la operación de venta:
- Un vehículo puede estar en `published` sin tener ninguna operación de venta creada
- Al pasar a `reserved`, se puede vincular con una operación de venta existente o crear una nueva
- Al pasar a `sold`, debe existir una operación de venta en estado `sold` o `delivered`

### Permisos
Se extiende el sistema de permisos existente (`TEAM_PERMISSION_KEYS` / `teamPermissions`) con sub-permisos granulares para el módulo de vehículos. Los sub-permisos son opcionales: si no existen, se aplican los presets por defecto según el rol del usuario.

### Alertas
Las nuevas alertas siguen exactamente el mismo patrón del `alertEngine.js` actual: misma función `emitAlert()`, misma deduplicación por `_id` diario, mismas notificaciones in-app + SSE + Web Push, misma estructura de configuración en `account.alertConfig`.

### i18n
Los labels nuevos deben incluirse en los idiomas existentes del sistema (es, en, pt, fr) siguiendo el patrón de `i18n.ts`.

